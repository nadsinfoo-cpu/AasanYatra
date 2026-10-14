const express = require("express");
const db = require("../db");
const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/auth");

const router = express.Router();

// GET /api/admin/ride-requests
router.get(
  "/",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const [requests] = await db.execute(`
        SELECT
          r.id,
          r.booking_id,
          r.driver_id,
          r.status,
          r.admin_notes,
          r.created_at,
          b.booking_reference,
          b.pickup_city,
          b.drop_city,
          b.pickup_datetime,
          b.vehicle_type,
          b.estimated_fare,
          b.status AS booking_status,
          d.vehicle_registration_number,
          u.full_name AS driver_name,
          u.phone AS driver_phone
        FROM driver_ride_requests r
        JOIN bookings b ON b.id = r.booking_id
        JOIN driver_profiles d ON d.id = r.driver_id
        JOIN users u ON u.id = d.user_id
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 100
      `);

      return res.json({
        success: true,
        count: requests.length,
        requests
      });
    } catch (error) {
      console.error("Admin ride requests error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to load ride requests."
      });
    }
  }
);

// PATCH /api/admin/ride-requests/:id/approve
router.patch(
  "/:id/approve",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    const requestId = Number(req.params.id);

    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID."
      });
    }

    let connection;
    let transactionStarted = false;

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      // Read request to determine which booking must be locked.
      const [initialRequests] = await connection.execute(
        `SELECT booking_id
         FROM driver_ride_requests
         WHERE id = ?`,
        [requestId]
      );

      if (!initialRequests.length) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(404).json({
          success: false,
          message: "Ride request not found."
        });
      }

      const bookingId = initialRequests[0].booking_id;

      // Lock booking first, consistent with driver request API.
      const [bookings] = await connection.execute(
        `SELECT id, status, driver_id, pickup_datetime,
                vehicle_type, passenger_count, passenger_id
         FROM bookings
         WHERE id = ?
         FOR UPDATE`,
        [bookingId]
      );

      if (
        !bookings.length ||
        bookings[0].status !== "CONFIRMED" ||
        bookings[0].driver_id !== null ||
        new Date(bookings[0].pickup_datetime).getTime() <= Date.now()
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "Booking is no longer available for assignment."
        });
      }

      const [requests] = await connection.execute(
        `SELECT id, booking_id, driver_id, status
         FROM driver_ride_requests
         WHERE id = ?
         FOR UPDATE`,
        [requestId]
      );

      const request = requests[0];

      if (
        !request ||
        Number(request.booking_id) !== Number(bookingId) ||
        request.status !== "PENDING"
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "Only pending requests can be approved."
        });
      }

      const [drivers] = await connection.execute(
        `SELECT id, user_id, vehicle_type, vehicle_seats,
                approval_status
         FROM driver_profiles
         WHERE id = ?`,
        [request.driver_id]
      );

      const driver = drivers[0];
      const booking = bookings[0];

      if (
        !driver ||
        driver.approval_status !== "APPROVED" ||
        driver.vehicle_type !== booking.vehicle_type ||
        Number(driver.vehicle_seats) < Number(booking.passenger_count) ||
        Number(driver.user_id) === Number(booking.passenger_id)
      ) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(403).json({
          success: false,
          message: "Driver is no longer eligible."
        });
      }

      const [settings] = await connection.execute(
        `SELECT setting_value
         FROM app_settings
         WHERE setting_key = 'ride_assignment_mode'
         LIMIT 1`
      );

      if ((settings[0]?.setting_value || "MANUAL") !== "MANUAL") {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "Manual approval is only available in MANUAL mode."
        });
      }

      const [updated] = await connection.execute(
        `UPDATE bookings
         SET driver_id = ?, status = 'DRIVER_ASSIGNED'
         WHERE id = ?
           AND status = 'CONFIRMED'
           AND driver_id IS NULL`,
        [driver.id, bookingId]
      );

      if (updated.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: "Booking was already assigned."
        });
      }

      await connection.execute(
        `UPDATE driver_ride_requests
         SET status = 'APPROVED',
             reviewed_by = ?,
             reviewed_at = NOW()
         WHERE id = ?`,
        [req.user.id, requestId]
      );

      await connection.execute(
        `UPDATE driver_ride_requests
         SET status = 'REJECTED',
             reviewed_at = NOW(),
             admin_notes = 'Another driver was assigned.'
         WHERE booking_id = ?
           AND id <> ?
           AND status = 'PENDING'`,
        [bookingId, requestId]
      );

      await connection.commit();
      transactionStarted = false;

      return res.json({
        success: true,
        message: "Driver approved and booking assigned.",
        booking_id: bookingId,
        driver_id: driver.id,
        status: "DRIVER_ASSIGNED"
      });
    } catch (error) {
      if (connection && transactionStarted) {
        await connection.rollback();
      }

      console.error("Approve ride request error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to approve ride request."
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

// PATCH /api/admin/ride-requests/:id/reject
router.patch(
  "/:id/reject",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    const requestId = Number(req.params.id);

    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID."
      });
    }

    try {
      const [result] = await db.execute(
        `UPDATE driver_ride_requests
         SET status = 'REJECTED',
             reviewed_by = ?,
             reviewed_at = NOW(),
             admin_notes = ?
         WHERE id = ?
           AND status = 'PENDING'`,
        [
          req.user.id,
          String(req.body?.notes || "Rejected by Super Admin").slice(0, 500),
          requestId
        ]
      );

      if (result.affectedRows !== 1) {
        return res.status(409).json({
          success: false,
          message: "Request not found or already reviewed."
        });
      }

      return res.json({
        success: true,
        message: "Ride request rejected."
      });
    } catch (error) {
      console.error("Reject ride request error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to reject ride request."
      });
    }
  }
);

module.exports = router;