
const express = require("express");
const router = express.Router();

const db = require("../db");
const {
    authenticateToken,
    authorizeRoles
} = require("../middleware/auth");
const path = require("path");
const {
  uploadDriverDocument,
  uploadDirectory,
} = require("../middleware/upload");

// Supported vehicle types
const VEHICLE_TYPES = [
  "HATCHBACK",
  "SEDAN",
  "SUV",
  "TEMPO_TRAVELLER",
];

// POST /api/drivers/register
// Register the currently logged-in user as a driver.
router.post("/register", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID missing from authentication token.",
      });
    }

    const {
      date_of_birth,
      address,
      vehicle_type,
      vehicle_registration_number,
      vehicle_make,
      vehicle_model,
      vehicle_year,
      vehicle_seats,
    } = req.body;

    if (
      !vehicle_type ||
      !VEHICLE_TYPES.includes(vehicle_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid vehicle type.",
      });
    }

    if (!vehicle_registration_number || !vehicle_make || !vehicle_model) {
      return res.status(400).json({
        success: false,
        message: "Vehicle registration number, make and model are required.",
      });
    }

    const registrationNumber =
      vehicle_registration_number.trim().toUpperCase();

    if (registrationNumber.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Vehicle registration number is too long.",
      });
    }

    if (
      vehicle_year != null &&
      (!Number.isInteger(Number(vehicle_year)) ||
        Number(vehicle_year) < 1900 ||
        Number(vehicle_year) > new Date().getFullYear() + 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid vehicle year.",
      });
    }

    if (
      vehicle_seats != null &&
      (!Number.isInteger(Number(vehicle_seats)) ||
        Number(vehicle_seats) < 1 ||
        Number(vehicle_seats) > 50)
    ) {
      return res.status(400).json({
        success: false,
        message: "Vehicle seats must be between 1 and 50.",
      });
    }

    const [existing] = await db.query(
      "SELECT id FROM driver_profiles WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "A driver profile already exists for this account.",
      });
    }

    const [result] = await db.query(
      `INSERT INTO driver_profiles (
        user_id,
        date_of_birth,
        address,
        vehicle_type,
        vehicle_registration_number,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vehicle_seats,
        approval_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        userId,
        date_of_birth || null,
        address?.trim() || null,
        vehicle_type,
        registrationNumber,
        vehicle_make.trim(),
        vehicle_model.trim(),
        vehicle_year == null ? null : Number(vehicle_year),
        vehicle_seats == null ? null : Number(vehicle_seats),
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Driver registration submitted for admin approval.",
      driver: {
        id: result.insertId,
        user_id: userId,
        vehicle_type,
        vehicle_registration_number: registrationNumber,
        approval_status: "PENDING",
      },
    });
  } catch (error) {
    console.error("Driver registration error:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "This vehicle registration number is already registered.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register driver at this time.",
    });
  }
});

/**
 * DRIVER: Resubmit rejected profile
 * PATCH /api/drivers/resubmit
 */
router.patch("/resubmit", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please log in to continue."
      });
    }

    const [profiles] = await db.execute(
      `SELECT id, approval_status
       FROM driver_profiles
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (profiles.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found."
      });
    }

    const driver = profiles[0];

    if (driver.approval_status !== "REJECTED") {
      return res.status(409).json({
        success: false,
        message: "Only rejected driver profiles can be resubmitted."
      });
    }

    const requiredTypes = [
      "DRIVING_LICENSE",
      "VEHICLE_RC",
      "INSURANCE"
    ];

    const [documents] = await db.execute(
      `SELECT d.document_type
       FROM driver_documents d
       WHERE d.driver_id = ?
         AND d.verification_status IN ('PENDING', 'VERIFIED')
         AND (d.expiry_date IS NULL OR d.expiry_date >= CURRENT_DATE())
         AND d.id > COALESCE((
           SELECT MAX(r.id)
           FROM driver_documents r
           WHERE r.driver_id = d.driver_id
             AND r.document_type = d.document_type
             AND r.verification_status = 'REJECTED'
         ), 0)
       GROUP BY d.document_type`,
      [driver.id]
    );

    const submittedTypes = new Set(
      documents.map(doc => doc.document_type)
    );

    const missingDocuments = requiredTypes.filter(
      type => !submittedTypes.has(type)
    );

    if (missingDocuments.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Upload replacement documents before resubmitting.",
        missing_documents: missingDocuments
      });
    }

    const [result] = await db.execute(
      `UPDATE driver_profiles
       SET approval_status = 'PENDING',
           admin_notes = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND approval_status = 'REJECTED'`,
      [driver.id]
    );

    if (result.affectedRows !== 1) {
      return res.status(409).json({
        success: false,
        message: "Driver profile status changed. Please try again."
      });
    }

    return res.json({
      success: true,
      message: "Driver profile resubmitted for admin review.",
      driver_id: driver.id,
      approval_status: "PENDING"
    });

  } catch (error) {
    console.error("Driver resubmission error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resubmit driver profile."
    });
  }
});

// GET /api/drivers/me
// View the logged-in user's driver profile.
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID missing from authentication token.",
      });
    }

    const [rows] = await db.query(
      `SELECT
        id,
        user_id,
        date_of_birth,
        address,
        vehicle_type,
        vehicle_registration_number,
        vehicle_make,
        vehicle_model,
        vehicle_year,
        vehicle_seats,
        approval_status,
        created_at,
        updated_at
      FROM driver_profiles
      WHERE user_id = ?
      LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Driver profile not found. Please register first.",
      });
    }

    return res.json({
      success: true,
      driver: rows[0],
    });
  } catch (error) {
    console.error("Get driver profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve driver profile.",
    });
  }
});


const DOCUMENT_TYPES = [
  "DRIVING_LICENSE",
  "VEHICLE_RC",
  "INSURANCE",
  "PERMIT",
  "POLLUTION_CERTIFICATE",
  "PROFILE_PHOTO",
  "OTHER",
];

router.post(
  "/documents",
  authenticateToken,
  (req, res, next) => {
    uploadDriverDocument(req, res, (error) => {
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message || "File upload failed.",
        });
      }
      next();
    });
  },
  async (req, res) => {
    let savedDocumentId = null;

    try {
      const userId = req.user?.userId ?? req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User ID missing from authentication token.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please attach a file using the field name "document".',
        });
      }

      const { document_type, document_number, expiry_date } = req.body;

      if (!DOCUMENT_TYPES.includes(document_type)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid document_type.",
        });
      }

      // Confirm this account owns a driver profile.
      const [profiles] = await db.query(
        "SELECT id FROM driver_profiles WHERE user_id = ? LIMIT 1",
        [userId]
      );

      if (profiles.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Register as a driver before uploading documents.",
        });
      }

      let normalizedExpiryDate = null;

      if (expiry_date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
          return res.status(400).json({
            success: false,
            message: "expiry_date must use YYYY-MM-DD format.",
          });
        }

        const parsedDate = new Date(`${expiry_date}T00:00:00Z`);

        if (
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== expiry_date
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid expiry_date.",
          });
        }

        normalizedExpiryDate = expiry_date;
      }

      const [result] = await db.query(
        `INSERT INTO driver_documents
          (driver_id, document_type, document_number, file_path,
           expiry_date, verification_status)
         VALUES (?, ?, ?, ?, ?, 'PENDING')`,
        [
          profiles[0].id,
          document_type,
          document_number?.trim() || null,
          path.join("driver_documents", req.file.filename),
          normalizedExpiryDate,
        ]
      );

      savedDocumentId = result.insertId;

      return res.status(201).json({
        success: true,
        message: "Document uploaded and submitted for verification.",
        document: {
          id: savedDocumentId,
          document_type,
          expiry_date: normalizedExpiryDate,
          verification_status: "PENDING",
        },
      });
    } catch (error) {
      console.error("Driver document upload error:", error.message);

      // Remove the uploaded file if the database insert failed.
      if (req.file?.path && !savedDocumentId) {
        require("fs").promises.unlink(req.file.path).catch(() => {});
      }

      return res.status(500).json({
        success: false,
        message: "Unable to save driver document.",
      });
    }
  }
);

router.get("/documents", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId ?? req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User ID missing from authentication token.",
      });
    }

    const [rows] = await db.query(
      `SELECT
         dd.id,
         dd.document_type,
         dd.document_number,
         dd.expiry_date,
         dd.verification_status,
         dd.admin_notes,
         dd.reviewed_at,
         dd.created_at
       FROM driver_documents dd
       INNER JOIN driver_profiles dp ON dp.id = dd.driver_id
       WHERE dp.user_id = ?
       ORDER BY dd.created_at DESC`,
      [userId]
    );

    return res.json({
      success: true,
      count: rows.length,
      documents: rows,
    });
  } catch (error) {
    console.error("Get driver documents error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve driver documents.",
    });
  }
});
// ADMIN: List pending driver documents
router.get(
    "/admin/documents",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        try {
            const [documents] = await db.execute(
                `SELECT
                    dd.id,
                    dd.driver_id,
                    dd.document_type,
                    dd.document_number,
                    dd.expiry_date,
                    dd.verification_status,
                    dd.admin_notes,
                    dd.created_at,
                    dp.user_id,
                    u.full_name,
                    u.phone
                 FROM driver_documents dd
                 INNER JOIN driver_profiles dp ON dp.id = dd.driver_id
                 INNER JOIN users u ON u.id = dp.user_id
                 WHERE dd.verification_status = 'PENDING'
                 ORDER BY dd.created_at ASC`
            );

            return res.json({
                success: true,
                count: documents.length,
                documents
            });
        } catch (error) {
            console.error("Admin document list error:", error.message);
            return res.status(500).json({
                success: false,
                message: "Unable to retrieve pending documents."
            });
        }
    }
);
// SUPER ADMIN: Get all driver documents
router.get(
  "/admin/documents/all",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const [documents] = await db.execute(
        `SELECT
          dd.id,
          dd.driver_id,
          dd.document_type,
          dd.document_number,
          dd.expiry_date,
          dd.verification_status,
          dd.admin_notes,
          dd.created_at,
          dd.reviewed_at,
          dp.user_id,
          u.full_name,
          u.phone
        FROM driver_documents dd
        INNER JOIN driver_profiles dp ON dp.id = dd.driver_id
        INNER JOIN users u ON u.id = dp.user_id
        ORDER BY dd.created_at DESC
        LIMIT 100`
      );

      return res.json({
        success: true,
        count: documents.length,
        documents
      });
    } catch (error) {
      console.error("All documents error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve all documents."
      });
    }
  }
);
// ADMIN: Approve or reject a pending document
router.patch(
    "/admin/documents/:documentId/review",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        const documentId = Number(req.params.documentId);
        const status = req.body.status;
        const notes = req.body.admin_notes;

        if (!Number.isSafeInteger(documentId) || documentId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid document ID."
            });
        }

        if (!["VERIFIED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be VERIFIED or REJECTED."
            });
        }

        if (
            notes !== undefined &&
            (typeof notes !== "string" || notes.length > 500)
        ) {
            return res.status(400).json({
                success: false,
                message: "Admin notes must be text up to 500 characters."
            });
        }

        const cleanNotes = notes?.trim() || null;

        if (status === "REJECTED" && !cleanNotes) {
            return res.status(400).json({
                success: false,
                message: "A rejection reason is required."
            });
        }

        let connection;

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [documents] = await connection.execute(
                `SELECT id, verification_status
                 FROM driver_documents
                 WHERE id = ?
                 FOR UPDATE`,
                [documentId]
            );

            if (!documents.length) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "Document not found."
                });
            }

            if (documents[0].verification_status !== "PENDING") {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: "This document has already been reviewed."
                });
            }

            await connection.execute(
                `UPDATE driver_documents
                 SET verification_status = ?,
                     admin_notes = ?,
                     reviewed_by = ?,
                     reviewed_at = UTC_TIMESTAMP()
                 WHERE id = ?`,
                [status, cleanNotes, req.user.id, documentId]
            );

            await connection.commit();

            return res.json({
                success: true,
                message: "Document review completed.",
                document: {
                    id: documentId,
                    verification_status: status,
                    admin_notes: cleanNotes,
                    reviewed_by: req.user.id
                }
            });
        } catch (error) {
            if (connection) await connection.rollback();

            console.error("Admin document review error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to review document."
            });
        } finally {
            if (connection) connection.release();
        }
    }
);


/**
 * SUPER ADMIN: List driver profiles awaiting review
 * GET /api/drivers/admin/profiles
 */
router.get(
    "/admin/profiles",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        try {
            const [profiles] = await db.execute(
                `SELECT
                    dp.id AS driver_id,
                    dp.user_id,
                    dp.date_of_birth,
                    dp.address,
                    dp.vehicle_type,
                    dp.vehicle_registration_number,
                    dp.vehicle_make,
                    dp.vehicle_model,
                    dp.vehicle_year,
                    dp.vehicle_seats,
                    dp.approval_status,
                    dp.admin_notes,
                    dp.created_at,
                    u.full_name,
                    u.phone,
                    (
                        SELECT COUNT(*)
                        FROM driver_documents dd
                        WHERE dd.driver_id = dp.id
                    ) AS total_documents
                 FROM driver_profiles dp
                 INNER JOIN users u ON u.id = dp.user_id
                 WHERE dp.approval_status = 'PENDING'
                 ORDER BY dp.created_at ASC`
            );

            return res.json({
                success: true,
                count: profiles.length,
                profiles
            });
        } catch (error) {
            console.error("Admin driver profiles error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to load driver profiles."
            });
        }
    }
);


/**
 * SUPER ADMIN: List all drivers with optional filters and search
 * GET /api/drivers/admin/profiles/all
 *
 * Query parameters:
 *   status=PENDING|APPROVED|REJECTED|SUSPENDED
 *   search=driver name, phone, profile ID, or vehicle registration
 *   page=1
 *   limit=20
 */
router.get(
    "/admin/profiles/all",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        try {
            const allowedStatuses = [
                "PENDING",
                "APPROVED",
                "REJECTED",
                "SUSPENDED"
            ];

            const status = req.query.status
                ? String(req.query.status).toUpperCase()
                : "";

            const search = typeof req.query.search === "string"
                ? req.query.search.trim().slice(0, 100)
                : "";

            const page = Number(req.query.page ?? 1);
            const limit = Number(req.query.limit ?? 20);

            if (status && !allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid driver status filter."
                });
            }

            if (
                !Number.isSafeInteger(page) ||
                page < 1 ||
                !Number.isSafeInteger(limit) ||
                limit < 1 ||
                limit > 100
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Page must be positive and limit must be between 1 and 100."
                });
            }

            const conditions = [];
            const params = [];

            if (status) {
                conditions.push("dp.approval_status = ?");
                params.push(status);
            }

            if (search) {
                conditions.push(`(
                    CAST(dp.id AS CHAR) LIKE ?
                    OR u.full_name LIKE ?
                    OR u.phone LIKE ?
                    OR dp.vehicle_registration_number LIKE ?
                )`);

                const searchTerm = `%${search}%`;

                params.push(
                    searchTerm,
                    searchTerm,
                    searchTerm,
                    searchTerm
                );
            }

            const whereClause = conditions.length
                ? `WHERE ${conditions.join(" AND ")}`
                : "";

            const offset = (page - 1) * limit;

            const [countRows] = await db.execute(
                `SELECT COUNT(*) AS total
                 FROM driver_profiles dp
                 INNER JOIN users u ON u.id = dp.user_id
                 ${whereClause}`,
                params
            );

            const [profiles] = await db.execute(
                `SELECT
                    dp.id AS driver_id,
                    dp.user_id,
                    dp.vehicle_type,
                    dp.vehicle_registration_number,
                    dp.vehicle_make,
                    dp.vehicle_model,
                    dp.vehicle_year,
                    dp.vehicle_seats,
                    dp.approval_status,
                    dp.admin_notes,
                    dp.reviewed_by,
                    dp.reviewed_at,
                    dp.created_at,
                    dp.updated_at,
                    u.full_name,
                    u.phone,
                    (
                        SELECT COUNT(*)
                        FROM driver_documents dd
                        WHERE dd.driver_id = dp.id
                    ) AS total_documents
                 FROM driver_profiles dp
                 INNER JOIN users u ON u.id = dp.user_id
                 ${whereClause}
                 ORDER BY dp.created_at DESC, dp.id DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const total = Number(countRows[0].total);

            return res.json({
                success: true,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                },
                count: profiles.length,
                profiles
            });
        } catch (error) {
            console.error(
                "Admin all-drivers list error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to load driver profiles."
            });
        }
    }
);

/**
 * SUPER ADMIN: Approve or reject a driver profile
 * PATCH /api/drivers/admin/profiles/:driverId/review
 *
 * Body:
 * { "status": "APPROVED" }
 * or
 * { "status": "REJECTED", "admin_notes": "Reason for rejection" }
 */

/**
 * SUPER ADMIN: Suspend or reactivate a driver
 * PATCH /api/drivers/admin/profiles/:driverId/status
 *
 * Body:
 * { "action": "SUSPEND", "admin_notes": "Reason for suspension" }
 * { "action": "REACTIVATE", "admin_notes": "Reason for reactivation" }
 */
router.patch(
    "/admin/profiles/:driverId/status",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        try {
            const driverId = Number(req.params.driverId);
            const action = String(req.body.action || "").toUpperCase();
            const notes = typeof req.body.admin_notes === "string"
                ? req.body.admin_notes.trim()
                : "";

            if (!Number.isSafeInteger(driverId) || driverId < 1) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid driver ID."
                });
            }

            if (!["SUSPEND", "REACTIVATE"].includes(action)) {
                return res.status(400).json({
                    success: false,
                    message: "Action must be SUSPEND or REACTIVATE."
                });
            }

            if (!notes) {
                return res.status(400).json({
                    success: false,
                    message: "Admin notes are required."
                });
            }

            const [drivers] = await db.execute(
                `SELECT id, approval_status
                 FROM driver_profiles
                 WHERE id = ?
                 LIMIT 1`,
                [driverId]
            );

            if (drivers.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Driver profile not found."
                });
            }

            const currentStatus = drivers[0].approval_status;

            let newStatus;

            if (action === "SUSPEND") {
                if (currentStatus !== "APPROVED") {
                    return res.status(409).json({
                        success: false,
                        message: "Only approved drivers can be suspended.",
                        current_status: currentStatus
                    });
                }

                newStatus = "SUSPENDED";
            } else {
                if (currentStatus !== "SUSPENDED") {
                    return res.status(409).json({
                        success: false,
                        message: "Only suspended drivers can be reactivated.",
                        current_status: currentStatus
                    });
                }

                // Recheck required documents before reactivation.
                const [documents] = await db.execute(
                    `SELECT document_type
                     FROM driver_documents
                     WHERE driver_id = ?
                       AND verification_status = 'VERIFIED'
                       AND (
                           expiry_date IS NULL
                           OR expiry_date >= CURRENT_DATE()
                       )
                       AND document_type IN (
                           'DRIVING_LICENSE',
                           'VEHICLE_RC',
                           'INSURANCE'
                       )
                     GROUP BY document_type`,
                    [driverId]
                );

                const verifiedTypes = new Set(
                    documents.map(doc => doc.document_type)
                );

                const requiredTypes = [
                    "DRIVING_LICENSE",
                    "VEHICLE_RC",
                    "INSURANCE"
                ];

                const missingDocuments = requiredTypes.filter(
                    type => !verifiedTypes.has(type)
                );

                if (missingDocuments.length > 0) {
                    return res.status(409).json({
                        success: false,
                        message: "Driver cannot be reactivated until all required documents are verified and unexpired.",
                        missing_documents: missingDocuments
                    });
                }

                newStatus = "APPROVED";
            }

            await db.execute(
                `UPDATE driver_profiles
                 SET approval_status = ?,
                     admin_notes = ?,
                     reviewed_by = ?,
                     reviewed_at = UTC_TIMESTAMP(),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    newStatus,
                    notes,
                    req.user.id,
                    driverId
                ]
            );

            return res.json({
                success: true,
                message: action === "SUSPEND"
                    ? "Driver suspended successfully."
                    : "Driver reactivated successfully.",
                driver_id: driverId,
                previous_status: currentStatus,
                approval_status: newStatus
            });
        } catch (error) {
            console.error(
                "Admin driver status update error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "Unable to update driver status."
            });
        }
    }
);

router.patch(
    "/admin/profiles/:driverId/review",
    authenticateToken,
    authorizeRoles("SUPER_ADMIN"),
    async (req, res) => {
        const driverId = Number(req.params.driverId);
        const { status, admin_notes } = req.body;

        if (
            !Number.isSafeInteger(driverId) ||
            driverId <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid driver ID."
            });
        }

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be APPROVED or REJECTED."
            });
        }

        const notes =
            typeof admin_notes === "string"
                ? admin_notes.trim()
                : "";

        if (notes.length > 500) {
            return res.status(400).json({
                success: false,
                message: "Admin notes cannot exceed 500 characters."
            });
        }

        if (status === "REJECTED" && !notes) {
            return res.status(400).json({
                success: false,
                message: "Please provide a rejection reason."
            });
        }

        let connection;
            
      try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const [profiles] = await connection.execute(
                `SELECT id, user_id, approval_status
                 FROM driver_profiles
                 WHERE id = ?
                 FOR UPDATE`,
                [driverId]
            );

            if (profiles.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    success: false,
                    message: "Driver profile not found."
                });
            }

            if (profiles[0].approval_status !== "PENDING") {
                await connection.rollback();

                return res.status(409).json({
                    success: false,
                    message:
                        "Only pending driver profiles can be reviewed."
                });
            }

            // Approval requires verified, unexpired documents.
            if (status === "APPROVED") {
                const requiredDocuments = [
                    "DRIVING_LICENSE",
                    "VEHICLE_RC",
                    "INSURANCE"
                ];

                const [documents] = await connection.execute(
                    `SELECT DISTINCT document_type
                     FROM driver_documents
                     WHERE driver_id = ?
                       AND verification_status = 'VERIFIED'
                       AND (
                           expiry_date IS NULL
                           OR expiry_date >= CURRENT_DATE()
                       )`,
                    [driverId]
                );

                const verifiedTypes = new Set(
                    documents.map(doc => doc.document_type)
                );

                const missingDocuments =
                    requiredDocuments.filter(
                        type => !verifiedTypes.has(type)
                    );

                if (missingDocuments.length > 0) {
                    await connection.rollback();

                    return res.status(400).json({
                        success: false,
                        message:
                            "Driver cannot be approved until all required documents are verified.",
                        missing_documents: missingDocuments
                    });
                }
            }

            await connection.execute(
                `UPDATE driver_profiles
                 SET approval_status = ?,
                     admin_notes = ?,
                     reviewed_by = ?,
                     reviewed_at = UTC_TIMESTAMP()
                 WHERE id = ?`,
                [
                    status,
                    notes || null,
                    req.user.id,
                    driverId
                ]
            );
            
            if (status === "APPROVED") {
                const driverUserId = profiles[0].user_id;

                const [driverRoles] = await connection.execute(
                    "SELECT id FROM roles WHERE code = 'DRIVER' LIMIT 1"
                );

                if (driverRoles.length === 0) {
                    throw new Error("DRIVER role is missing from roles table.");
                }

                await connection.execute(
                    `INSERT INTO user_roles (user_id, role_id)
                     SELECT ?, ?
                     WHERE NOT EXISTS (
                         SELECT 1 FROM user_roles
                         WHERE user_id = ? AND role_id = ?
                     )`,
                    [
                        driverUserId,
                        driverRoles[0].id,
                        driverUserId,
                        driverRoles[0].id
                    ]
                );
            }

            await connection.commit();
                
            return res.json({
                success: true,
                message:
                    status === "APPROVED"
                        ? "Driver profile approved successfully."
                        : "Driver profile rejected successfully.",
                driver_id: driverId,
                approval_status: status
            });
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Driver review rollback error:",
                        rollbackError.message
                    );
                }
            }

            console.error("Driver profile review error:", error.message);

            return res.status(500).json({
                success: false,
                message: "Unable to review driver profile."
            });
        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);
// SUPER ADMIN: Secure driver document viewing
router.get(
  "/admin/documents/:documentId/view",
  authenticateToken,
  authorizeRoles("SUPER_ADMIN"),
  async (req, res) => {
    try {
      const documentId = Number(req.params.documentId);

      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID."
        });
      }

      const [rows] = await db.query(
        "SELECT file_path FROM driver_documents WHERE id = ? LIMIT 1",
        [documentId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found."
        });
      }

      const fs = require("fs");
      const storedPath = rows[0].file_path;

      if (typeof storedPath !== "string" || !storedPath.trim()) {
        return res.status(404).json({
          success: false,
          message: "Document file unavailable."
        });
      }

      // Only allow files within the private upload directory.
     const root = path.resolve(uploadDirectory);

// Database paths start with "driver_documents/".
// Accept only that folder prefix and a single safe filename.
const normalizedPath = storedPath.replace(/\\/g, "/");

const match = /^driver_documents\/([a-f0-9-]{36}\.(?:pdf|jpg|jpeg|png))$/i.exec(
  normalizedPath
);

if (!match) {
  return res.status(403).json({
    success: false,
    message: "Invalid stored document path."
  });
}

const filePath = path.resolve(root, match[1]);
const relativePath = path.relative(root, filePath);

      if (
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith(".." + path.sep) ||
        path.isAbsolute(relativePath)
      ) {
        return res.status(403).json({
          success: false,
          message: "Invalid document path."
        });
      }

      const extension = path.extname(filePath).toLowerCase();

      const mimeTypes = {
        ".pdf": "application/pdf",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png"
      };

      if (!mimeTypes[extension]) {
        return res.status(415).json({
          success: false,
          message: "Unsupported document format."
        });
      }

      const realRoot = await fs.promises.realpath(root);
      const realFile = await fs.promises.realpath(filePath);
      const realRelative = path.relative(realRoot, realFile);

      if (
        realRelative === "" ||
        realRelative === ".." ||
        realRelative.startsWith(".." + path.sep) ||
        path.isAbsolute(realRelative)
      ) {
        return res.status(403).json({
          success: false,
          message: "Invalid document location."
        });
      }

      const fileStat = await fs.promises.stat(realFile);

      if (!fileStat.isFile()) {
        return res.status(404).json({
          success: false,
          message: "Document file unavailable."
        });
      }

      res.setHeader("Content-Type", mimeTypes[extension]);
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox");

      return res.sendFile(realFile);

    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          message: "Document file unavailable."
        });
      }

      console.error("Secure document viewing error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to open document."
      });
    }
  }
);
module.exports = router;
