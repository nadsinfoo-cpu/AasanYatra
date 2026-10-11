const express = require("express");
const crypto = require("crypto");
const db = require("../db");

const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

// Supported booking types
const bookingTypes = [
    "ONE_WAY",
    "ROUND_TRIP",
    "LOCAL",
    "AIRPORT_TRANSFER"
];

// Supported vehicle types
const vehicleTypes = [
    "HATCHBACK",
    "SEDAN",
    "SUV",
    "TEMPO_TRAVELLER"
];

// =====================================================
// 1. CREATE A NEW BOOKING
// POST /api/bookings
// Passenger login required
// =====================================================

router.post(
    "/",
    authenticateToken,
    authorizeRoles("PASSENGER"),
    async (req, res) => {
        const {
            booking_type,
            pickup_address,
            drop_address,
            pickup_city,
            drop_city,
            pickup_datetime,
            return_datetime,
            vehicle_type,
            passenger_count,
            distance_km
        } = req.body;

        // Validate basic booking details
        if (
            !bookingTypes.includes(booking_type) ||
            typeof pickup_address !== "string" ||
            !pickup_address.trim() ||
            pickup_address.trim().length > 500 ||
            typeof drop_address !== "string" ||
            !drop_address.trim() ||
            drop_address.trim().length > 500 ||
            typeof pickup_datetime !== "string" ||
            !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(
                pickup_datetime
            ) ||
            !vehicleTypes.includes(vehicle_type || "SEDAN")
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid booking details."
            });
        }

        // Validate pickup date and time
        const pickupDate = new Date(
            pickup_datetime.replace(" ", "T")
        );

        if (
            Number.isNaN(pickupDate.getTime()) ||
            pickupDate.getTime() <= Date.now()
        ) {
            return res.status(400).json({
                success: false,
                message: "Pickup date and time must be in the future."
            });
        }

        // Validate return time for round trips
        if (booking_type === "ROUND_TRIP") {
            if (
                typeof return_datetime !== "string" ||
                !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(
                    return_datetime
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "A valid return date and time is required."
                });
            }

            const returnDate = new Date(
                return_datetime.replace(" ", "T")
            );

            if (
                Number.isNaN(returnDate.getTime()) ||
                returnDate <= pickupDate
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Return time must be after pickup time."
                });
            }
        }

        // Validate passenger count and trip distance
        const count = Number(passenger_count ?? 1);
        const distance = Number(distance_km);

        if (
            !Number.isInteger(count) ||
            count < 1 ||
            count > 20 ||
            !Number.isFinite(distance) ||
            distance <= 0 ||
            distance > 10000
        ) {
            return res.status(400).json({
                success: false,
                message: "Passenger count or trip distance is invalid."
            });
        }

        // Validate optional city names
        if (
            (
                pickup_city != null &&
                (
                    typeof pickup_city !== "string" ||
                    pickup_city.trim().length > 100
                )
            ) ||
            (
                drop_city != null &&
                (
                    typeof drop_city !== "string" ||
                    drop_city.trim().length > 100
                )
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "City names must be 100 characters or fewer."
            });
        }

        // Prepare dates for MySQL
        const pickupSql = pickup_datetime.replace("T", " ");

        const returnSql =
            booking_type === "ROUND_TRIP"
                ? return_datetime.replace("T", " ")
                : null;

        // Generate a unique booking reference
        const bookingReference =
            "AY" +
            Date.now().toString(36).toUpperCase() +
            crypto.randomBytes(3).toString("hex").toUpperCase();

        try {
            // Get active fare configuration from the database
            const [fareRows] = await db.execute(
                `SELECT
                    base_fare,
                    per_km_rate,
                    fare_multiplier
                 FROM fare_settings
                 WHERE booking_type = ?
                   AND is_active = 1
                 LIMIT 1`,
                [booking_type]
            );

            if (fareRows.length === 0) {
                return res.status(503).json({
                    success: false,
                    message:
                        "Fare is not configured for this booking type."
                });
            }

            const rate = fareRows[0];

            // Calculate fare on the server.
            // Do not trust a fare supplied by the frontend.
            const baseFare = Number(rate.base_fare);
            const perKmRate = Number(rate.per_km_rate);
            const multiplier = Number(rate.fare_multiplier);

            if (
                !Number.isFinite(baseFare) ||
                !Number.isFinite(perKmRate) ||
                !Number.isFinite(multiplier) ||
                baseFare < 0 ||
                perKmRate < 0 ||
                multiplier <= 0
            ) {
                console.error("Invalid fare configuration:", booking_type);

                return res.status(503).json({
                    success: false,
                    message: "The fare configuration is invalid."
                });
            }

            const fare = Math.round(
                baseFare +
                distance * perKmRate * multiplier
            );

            // Save booking in MySQL
            const [result] = await db.execute(
                `INSERT INTO bookings (
                    booking_reference,
                    passenger_id,
                    booking_type,
                    pickup_address,
                    drop_address,
                    pickup_city,
                    drop_city,
                    pickup_datetime,
                    return_datetime,
                    vehicle_type,
                    passenger_count,
                    estimated_fare,
                    status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
                [
                    bookingReference,
                    req.user.id,
                    booking_type,
                    pickup_address.trim(),
                    drop_address.trim(),
                    pickup_city ? pickup_city.trim() : null,
                    drop_city ? drop_city.trim() : null,
                    pickupSql,
                    returnSql,
                    vehicle_type || "SEDAN",
                    count,
                    fare
                ]
            );

            return res.status(201).json({
                success: true,
                message: "Booking created successfully.",
                booking: {
                    id: result.insertId,
                    booking_reference: bookingReference,
                    booking_type,
                    estimated_fare: fare,
                    status: "PENDING"
                }
            });
        } catch (error) {
            console.error(
                "Create booking failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to create booking. Please check the server logs."
            });
        }
    }
);

// =====================================================
// 2. GET PASSENGER BOOKING HISTORY
// GET /api/bookings/my
// Passenger login required
// =====================================================

router.get(
    "/my",
    authenticateToken,
    authorizeRoles("PASSENGER"),
    async (req, res) => {
        try {
            const [bookings] = await db.execute(
                `SELECT
                    id,
                    booking_reference,
                    booking_type,
                    pickup_address,
                    drop_address,
                    pickup_city,
                    drop_city,
                    pickup_datetime,
                    return_datetime,
                    vehicle_type,
                    passenger_count,
                    estimated_fare,
                    final_fare,
                    status,
                    created_at
                 FROM bookings
                 WHERE passenger_id = ?
                 ORDER BY created_at DESC
                 LIMIT 100`,
                [req.user.id]
            );

            return res.json({
                success: true,
                count: bookings.length,
                bookings
            });
        } catch (error) {
            console.error(
                "Fetch passenger bookings failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve bookings."
            });
        }
    }
);

// =====================================================
// 3. GET BOOKING DETAILS
// GET /api/bookings/:id
// Passenger can only view their own booking
// =====================================================

router.get(
    "/:id",
    authenticateToken,
    authorizeRoles("PASSENGER"),
    async (req, res) => {
        const bookingId = Number(req.params.id);

        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID."
            });
        }

        try {
            const [bookings] = await db.execute(
                `SELECT
                    id,
                    booking_reference,
                    booking_type,
                    pickup_address,
                    drop_address,
                    pickup_city,
                    drop_city,
                    pickup_datetime,
                    return_datetime,
                    vehicle_type,
                    passenger_count,
                    estimated_fare,
                    final_fare,
                    status,
                    created_at
                 FROM bookings
                 WHERE id = ?
                   AND passenger_id = ?
                 LIMIT 1`,
                [bookingId, req.user.id]
            );

            if (bookings.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });
            }

            return res.json({
                success: true,
                booking: bookings[0]
            });
        } catch (error) {
            console.error(
                "Fetch booking details failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve booking details."
            });
        }
    }
);

// =====================================================
// 4. CANCEL A BOOKING
// PATCH /api/bookings/:id/cancel
// Only pending or confirmed bookings can be cancelled
// =====================================================

router.patch(
    "/:id/cancel",
    authenticateToken,
    authorizeRoles("PASSENGER"),
    async (req, res) => {
        const bookingId = Number(req.params.id);

        if (
            !Number.isSafeInteger(bookingId) ||
            bookingId < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID."
            });
        }

        try {
            const [result] = await db.execute(
                `UPDATE bookings
                 SET status = 'CANCELLED'
                 WHERE id = ?
                   AND passenger_id = ?
                   AND status IN ('PENDING', 'CONFIRMED')`,
                [bookingId, req.user.id]
            );

            if (result.affectedRows === 0) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Booking cannot be cancelled. It may not exist, belong to you, or already be in progress or completed."
                });
            }

            return res.json({
                success: true,
                message: "Booking cancelled successfully.",
                booking_id: bookingId,
                status: "CANCELLED"
            });
        } catch (error) {
            console.error(
                "Cancel booking failed:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to cancel booking."
            });
        }
    }
);

module.exports = router;