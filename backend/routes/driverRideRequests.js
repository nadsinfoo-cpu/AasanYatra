const express = require("express");
const db = require("../db");
const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

// POST /api/driver-ride-requests/:bookingId/request
router.post(
  "/:bookingId/request",
  authenticateToken,
  authorizeRoles("DRIVER"),
  async (req, res) => {
    const bookingId = Number(req.params.bookingId);

    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID."
      });
    }

    let connection;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Lock booking to serialize competing driver requests.
      const [bookings] = await connection.execute(
        `SELECT id, passenger_id, vehicle_type,
                passenger_count, pickup_datetime,
                status, driver_id
         FROM bookings
         WHERE id = ?
         FOR UPDATE`,
        [bookingId]
      );

      if (!bookings.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Booking not found."
        });
      }

      const booking = bookings[0];

      if (
        booking.status !== "CONFIRMED" ||
        booking.driver_id !== null ||
        new Date(booking.pickup_datetime).getTime() <= Date.now()
      ) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "Booking is no longer available."
        });
      }

      const [profiles] = await connection.execute(
        `SELECT id, vehicle_type, vehicle_seats, approval_status
         FROM driver_profiles
         WHERE user_id = ?
         LIMIT 1`,
        [req.user.id]
      );

      const driver = profiles[0];

      if (
        !driver ||
        driver.approval_status !== "APPROVED" ||
        driver.vehicle_type !== booking.vehicle_type ||
        Number(driver.vehicle_seats) < Number(booking.passenger_count) ||
        Number(booking.passenger_id) === Number(req.user.id)
      ) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "You are not eligible for this booking."
        });
      }

      const [existing] = await connection.execute(
        `SELECT id FROM driver_ride_requests
         WHERE booking_id = ? AND driver_id = ?
         LIMIT 1`,
        [bookingId, driver.id]
      );

      if (existing.length) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: "You have already requested this booking."
        });
      }

      const [settings] = await connection.execute(
        `SELECT setting_value
         FROM app_settings
         WHERE setting_key = 'ride_assignment_mode'
         LIMIT 1`
      );

      const mode = settings[0]?.setting_value || "MANUAL";

      if (!["MANUAL", "AUTO"].includes(mode)) {
        throw new Error("Invalid ride assignment configuration.");
      }

      const [result] = await connection.execute(
        `INSERT INTO driver_ride_requests
         (booking_id, driver_id, status)
         VALUES (?, ?, 'PENDING')`,
        [bookingId, driver.id]
      );

      if (mode === "AUTO") {
        const [update] = await connection.execute(
          `UPDATE bookings
           SET driver_id = ?, status = 'DRIVER_ASSIGNED'
           WHERE id = ?
             AND status = 'CONFIRMED'
             AND driver_id IS NULL`,
          [driver.id, bookingId]
        );

        if (update.affectedRows !== 1) {
          await connection.rollback();
          return res.status(409).json({
            success: false,
            message: "Booking has already been assigned."
          });
        }

        await connection.execute(
          `UPDATE driver_ride_requests
           SET status = 'APPROVED',
               reviewed_at = NOW()
           WHERE id = ?`,
          [result.insertId]
        );

        await connection.execute(
          `UPDATE driver_ride_requests
           SET status = 'REJECTED',
               reviewed_at = NOW()
           WHERE booking_id = ?
             AND id <> ?
             AND status = 'PENDING'`,
          [bookingId, result.insertId]
        );
      }

      await connection.commit();

      return res.status(201).json({
        success: true,
        request_id: result.insertId,
        mode,
        status: mode === "AUTO" ? "APPROVED" : "PENDING",
        message:
          mode === "AUTO"
            ? "Ride assigned successfully (FCFS)."
            : "Ride request submitted for admin approval."
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }

      console.error("Driver ride request error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to submit ride request."
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

module.exports = router;