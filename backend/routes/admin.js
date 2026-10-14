const express = require("express");
const db = require("../db");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

// GET /api/admin/stats
// Only authenticated Super Admin users can access.

router.get(
  "/stats",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const [[bookings]] = await db.execute(
        "SELECT COUNT(*) AS total FROM bookings"
      );

      const [[passengers]] = await db.execute(`
        SELECT COUNT(DISTINCT u.id) AS total
        FROM users u
        INNER JOIN user_roles ur
          ON ur.user_id = u.id
        INNER JOIN roles r
          ON r.id = ur.role_id
        WHERE r.code = 'PASSENGER'
      `);

      const [[drivers]] = await db.execute(`
        SELECT COUNT(*) AS total
        FROM driver_profiles
        WHERE approval_status = 'APPROVED'
      `);

      res.json({
        success: true,
        data: {
          total_bookings: bookings.total,
          total_passengers: passengers.total,
          approved_drivers: drivers.total,
          total_revenue: null
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load dashboard statistics."
      });
    }
  }
);

/*
 * GET /api/admin/booking-analytics
 * Super Admin access only
 */
router.get(
  "/booking-analytics",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      // Bookings created during the last 7 calendar days.
     const [dailyRows] = await db.execute(`
  SELECT
    DATE_FORMAT(created_at, '%Y-%m-%d') AS booking_date,
    COUNT(*) AS total
  FROM bookings
  WHERE created_at >= CURDATE() - INTERVAL 6 DAY
    AND created_at < CURDATE() + INTERVAL 1 DAY
  GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
  ORDER BY booking_date ASC
`);

      // All-time booking statuses.
      const [statusRows] = await db.execute(`
        SELECT status, COUNT(*) AS total
        FROM bookings
        GROUP BY status
        ORDER BY total DESC
      `);

      // All-time booking types.
      const [typeRows] = await db.execute(`
        SELECT booking_type, COUNT(*) AS total
        FROM bookings
        GROUP BY booking_type
        ORDER BY total DESC
      `);

      // Fill dates without bookings with zero.
      const dailyMap = new Map(
        dailyRows.map(row => [
          row.booking_date,
          Number(row.total)
        ])
      );

      const dailyBookings = [];

      for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - offset);

        const dateString = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0")
        ].join("-");

        dailyBookings.push({
          date: dateString,
          total: dailyMap.get(dateString) || 0
        });
      }

      res.json({
        success: true,
        data: {
          daily_bookings: dailyBookings,
          booking_statuses: statusRows.map(row => ({
            status: row.status,
            total: Number(row.total)
          })),
          booking_types: typeRows.map(row => ({
            booking_type: row.booking_type,
            total: Number(row.total)
          }))
        }
      });
    } catch (error) {
      console.error("Booking analytics error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load booking analytics."
      });
    }
  }
);

/*
 * GET /api/admin/passengers
 * Super Admin access only
 * Returns registered passengers and booking counts.
 */
router.get(
  "/passengers",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const [passengers] = await db.execute(`
        SELECT
          u.id,
          u.full_name,
          u.phone,
          u.status,
          u.created_at,
          COUNT(b.id) AS total_bookings
        FROM users u
        INNER JOIN user_roles ur
          ON ur.user_id = u.id
        INNER JOIN roles r
          ON r.id = ur.role_id
        LEFT JOIN bookings b
          ON b.passenger_id = u.id
        WHERE r.code = 'PASSENGER'
        GROUP BY
          u.id,
          u.full_name,
          u.phone,
          u.status,
          u.created_at
        ORDER BY u.created_at DESC
        LIMIT 100
      `);

      res.json({
        success: true,
        data: passengers.map((passenger) => ({
          ...passenger,
          total_bookings: Number(passenger.total_bookings)
        }))
      });
    } catch (error) {
      console.error("Passenger listing error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load passengers."
      });
    }
  }
);

/*
 * GET /api/admin/passengers/:passengerId
 * Passenger profile and booking history
 * Super Admin only
 */
router.get(
  "/passengers/:passengerId",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const passengerId = Number(req.params.passengerId);

      if (
        !Number.isSafeInteger(passengerId) ||
        passengerId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid passenger ID."
        });
      }

      const [passengers] = await db.execute(
        `
        SELECT
          u.id,
          u.full_name,
          u.phone,
          u.status,
          u.created_at
        FROM users u
        INNER JOIN user_roles ur
          ON ur.user_id = u.id
        INNER JOIN roles r
          ON r.id = ur.role_id
        WHERE u.id = ?
          AND r.code = 'PASSENGER'
        LIMIT 1
        `,
        [passengerId]
      );

      if (passengers.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Passenger not found."
        });
      }

      const [bookings] = await db.execute(
        `
        SELECT
          id,
          booking_reference,
          booking_type,
          pickup_city,
          drop_city,
          pickup_datetime,
          return_datetime,
          vehicle_type,
          passenger_count,
          estimated_fare,
          status,
          created_at
        FROM bookings
        WHERE passenger_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 100
        `,
        [passengerId]
      );

      const [[bookingCount]] = await db.execute(
        `
        SELECT COUNT(*) AS total
        FROM bookings
        WHERE passenger_id = ?
        `,
        [passengerId]
      );

      return res.json({
        success: true,
        data: {
          passenger: passengers[0],
          total_bookings: Number(bookingCount.total),
          bookings
        }
      });
    } catch (error) {
      console.error("Passenger details error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to load passenger details."
      });
    }
  }
);

router.patch(
  "/settings/location-maps",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { enabled } = req.body || {};

      if (typeof enabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "enabled must be true or false.",
        });
      }

      await db.execute(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value)`,
        ["location_maps_enabled", enabled ? "true" : "false"]
      );

      return res.json({
        success: true,
        message: "Location Maps setting updated.",
        data: { location_maps_enabled: enabled },
      });
    } catch (error) {
      console.error("Admin location setting error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update location setting.",
      });
    }
  }
);
// GET /api/admin/settings/ride-assignment
router.get(
  "/settings/ride-assignment",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const [rows] = await db.execute(
        `SELECT setting_value
         FROM app_settings
         WHERE setting_key = ?
         LIMIT 1`,
        ["ride_assignment_mode"]
      );

      const mode = rows[0]?.setting_value || "MANUAL";

      return res.json({
        success: true,
        data: {
          ride_assignment_mode: mode
        }
      });
    } catch (error) {
      console.error("Get ride assignment setting error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to load ride assignment setting."
      });
    }
  }
);

// PATCH /api/admin/settings/ride-assignment
router.patch(
  "/settings/ride-assignment",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const { mode } = req.body || {};

      if (!["MANUAL", "AUTO"].includes(mode)) {
        return res.status(400).json({
          success: false,
          message: "Mode must be MANUAL or AUTO."
        });
      }

      await db.execute(
        `INSERT INTO app_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value)`,
        ["ride_assignment_mode", mode]
      );

      return res.json({
        success: true,
        message: "Ride assignment mode updated successfully.",
        data: {
          ride_assignment_mode: mode
        }
      });
    } catch (error) {
      console.error("Update ride assignment setting error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update ride assignment setting."
      });
    }
  }
);
/*
 * GET /api/admin/bookings
 * Super Admin only
 * Supports search, status, dates and pagination.
 */
router.get(
  "/bookings",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const page = Math.max(
        1,
        Number.parseInt(req.query.page, 10) || 1
      );

      const limit = 20;

      if (!Number.isSafeInteger(page) || page > 1000000) {
        return res.status(400).json({
          success: false,
          message: "Invalid page number."
        });
      }

      const offset = (page - 1) * limit;
      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();

      const allowedStatuses = [
        "PENDING",
        "CONFIRMED",
        "DRIVER_ASSIGNED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED"
      ];

      if (status && !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status."
        });
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;

      if (
        (from && !datePattern.test(from)) ||
        (to && !datePattern.test(to)) ||
        (from && to && from > to)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid date range."
        });
      }

      if (search.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Search is too long."
        });
      }

      const conditions = [];
      const params = [];

      if (search) {
        conditions.push(`(
          b.booking_reference LIKE ?
          OR b.pickup_city LIKE ?
          OR b.drop_city LIKE ?
          OR u.full_name LIKE ?
          OR u.phone LIKE ?
        )`);

        const term = `%${search}%`;
        params.push(term, term, term, term, term);
      }

      if (status) {
        conditions.push("b.status = ?");
        params.push(status);
      }

      if (from) {
        conditions.push("b.pickup_datetime >= ?");
        params.push(`${from} 00:00:00`);
      }

      if (to) {
        conditions.push("b.pickup_datetime < DATE_ADD(?, INTERVAL 1 DAY)");
        params.push(to);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      const [[countRow]] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM bookings b
         JOIN users u ON u.id = b.passenger_id
         ${where}`,
        params
      );

      const [bookings] = await db.execute(
        `SELECT
           b.id,
           b.booking_reference,
           b.booking_type,
           b.pickup_address,
           b.drop_address,
           b.pickup_city,
           b.drop_city,
           b.pickup_datetime,
           b.return_datetime,
           b.vehicle_type,
           b.passenger_count,
           b.estimated_fare,
           b.status,
           b.created_at,
           u.id AS passenger_id,
           u.full_name AS passenger_name,
           u.phone AS passenger_phone
         FROM bookings b
         JOIN users u ON u.id = b.passenger_id
         ${where}
         ORDER BY b.created_at DESC, b.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      );

      const total = Number(countRow.total);

      res.json({
        success: true,
        data: {
          bookings,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error("Admin bookings error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load admin bookings."
      });
    }
  }
);


// PATCH /api/admin/bookings/:id/confirm
router.patch(
  "/bookings/:id/confirm",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    const bookingId = Number(req.params.id);

    if (!Number.isSafeInteger(bookingId) || bookingId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID."
      });
    }

    try {
      const [result] = await db.execute(
        `UPDATE bookings
         SET status = 'CONFIRMED'
         WHERE id = ?
           AND status = 'PENDING'
           AND driver_id IS NULL`,
        [bookingId]
      );

      if (result.affectedRows !== 1) {
        const [rows] = await db.execute(
          "SELECT id, status FROM bookings WHERE id = ? LIMIT 1",
          [bookingId]
        );

        if (!rows.length) {
          return res.status(404).json({
            success: false,
            message: "Booking not found."
          });
        }

        return res.status(409).json({
          success: false,
          message: "Only pending, unassigned bookings can be confirmed.",
          current_status: rows[0].status
        });
      }

      return res.json({
        success: true,
        message: "Booking confirmed successfully.",
        booking_id: bookingId,
        status: "CONFIRMED"
      });
    } catch (error) {
      console.error("Confirm booking failed:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to confirm booking."
      });
    }
  }
);

module.exports = router;

