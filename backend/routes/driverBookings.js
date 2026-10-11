const express = require("express");
const db = require("../db");
const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

// GET /api/driver-bookings/available
router.get(
    "/available",
    authenticateToken,
    authorizeRoles("DRIVER"),
    async (req, res) => {
        try {
            const [profiles] = await db.execute(
                `SELECT id, vehicle_type, vehicle_seats, approval_status
                 FROM driver_profiles
                 WHERE user_id = ?
                 LIMIT 1`,
                [req.user.id]
            );

            if (
                !profiles.length ||
                profiles[0].approval_status !== "APPROVED"
            ) {
                return res.status(403).json({
                    success: false,
                    message: "An approved driver profile is required."
                });
            }

            const driver = profiles[0];

            const [bookings] = await db.execute(
                `SELECT id, booking_reference, booking_type,
                        pickup_address, drop_address, pickup_city,
                        drop_city, pickup_datetime, vehicle_type,
                        passenger_count, estimated_fare, status
                 FROM bookings
                 WHERE status = 'PENDING'
                   AND driver_id IS NULL
                   AND pickup_datetime > NOW()
                   AND vehicle_type = ?
                   AND passenger_count <= ?
                 ORDER BY pickup_datetime ASC
                 LIMIT 50`,
                [driver.vehicle_type, driver.vehicle_seats || 0]
            );

            return res.json({
                success: true,
                count: bookings.length,
                bookings
            });
        } catch (error) {
            console.error("Available bookings failed:", error.message);
            return res.status(500).json({
                success: false,
                message: "Unable to retrieve available bookings."
            });
        }
    }
);

// PATCH /api/driver-bookings/:id/accept
router.patch(
    "/:id/accept",
    authenticateToken,
    authorizeRoles("DRIVER"),
    async (req, res) => {
        const bookingId = Number(req.params.id);

        if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID."
            });
        }

        let connection;
        let transactionStarted = false;

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            transactionStarted = true;

            const [profiles] = await connection.execute(
                `SELECT id, vehicle_type, vehicle_seats, approval_status
                 FROM driver_profiles
                 WHERE user_id = ?
                 LIMIT 1
                 FOR UPDATE`,
                [req.user.id]
            );

            if (
                !profiles.length ||
                profiles[0].approval_status !== "APPROVED"
            ) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(403).json({
                    success: false,
                    message: "An approved driver profile is required."
                });
            }

            const driver = profiles[0];

            const [rows] = await connection.execute(
                `SELECT id, booking_reference, passenger_id,
                        pickup_datetime, vehicle_type, passenger_count,
                        status, driver_id
                 FROM bookings
                 WHERE id = ?
                 FOR UPDATE`,
                [bookingId]
            );

            if (!rows.length) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });
            }

            const booking = rows[0];

            if (Number(booking.passenger_id) === Number(req.user.id)) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(403).json({
                    success: false,
                    message: "You cannot accept your own booking."
                });
            }

            if (
                booking.status !== "PENDING" ||
                booking.driver_id !== null
            ) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "This booking is no longer available."
                });
            }

            if (new Date(booking.pickup_datetime).getTime() <= Date.now()) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "The pickup time has passed."
                });
            }

            if (
                booking.vehicle_type !== driver.vehicle_type ||
                Number(booking.passenger_count) >
                    Number(driver.vehicle_seats || 0)
            ) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "Your vehicle does not match this booking."
                });
            }

            const [result] = await connection.execute(
                `UPDATE bookings
                 SET driver_id = ?, status = 'DRIVER_ASSIGNED'
                 WHERE id = ?
                   AND status = 'PENDING'
                   AND driver_id IS NULL`,
                [driver.id, bookingId]
            );

            if (result.affectedRows !== 1) {
                await connection.rollback();
                transactionStarted = false;

                return res.status(409).json({
                    success: false,
                    message: "This booking is no longer available."
                });
            }

            await connection.commit();
            transactionStarted = false;

            return res.json({
                success: true,
                message: "Booking accepted successfully.",
                booking_id: bookingId,
                booking_reference: booking.booking_reference,
                driver_profile_id: driver.id,
                status: "DRIVER_ASSIGNED"
            });
        } catch (error) {
            if (connection && transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }

            console.error("Accept booking failed:", error.message);
            return res.status(500).json({
                success: false,
                message: "Unable to accept this booking."
            });
        } finally {
            if (connection) connection.release();
        }
    }
);

module.exports = router;
