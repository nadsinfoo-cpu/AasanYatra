
const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const db = require("../db");

const router = express.Router();
const { authenticateToken } = require("../middleware/auth");

router.get("/me", authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: "Account retrieved successfully.",
        user: req.user
    });
});



const isLocalDevelopment = process.env.NODE_ENV === "development";

const otpRequestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isLocalDevelopment ? 30 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many OTP requests. Please wait before requesting another OTP."
    }
});

const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: isLocalDevelopment ? 30 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many OTP verification attempts. Please wait before trying again."
    }
});


function normalizePhone(value) {
    if (typeof value !== "string") return null;

    const phone = value.trim().replace(/[\s()-]/g, "");

    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

router.post("/request-otp", otpRequestLimiter, async (req, res) => {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid international phone number, e.g. +919876543210."
        });
    }

    try {
        await db.execute(
            `UPDATE otp_requests
             SET consumed_at = UTC_TIMESTAMP()
             WHERE phone = ? AND consumed_at IS NULL`,
            [phone]
        );

        // Local development only. Do not use this fixed OTP in production.
        const otp = "123456";
        const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

        await db.execute(
            `INSERT INTO otp_requests (phone, otp_hash, expires_at)
             VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE))`,
            [phone, otpHash]
        );

        res.json({
            success: true,
            message: "Development OTP created. Use 123456 for local testing."
        });
    } catch (error) {
        console.error("OTP request failed:", error.message);

        res.status(500).json({
            success: false,
            message: "Unable to request OTP. Check the database and server logs."
        });
    }
});

router.post("/verify-otp", otpVerifyLimiter, async (req, res) => {
    const phone = normalizePhone(req.body.phone);
    const otp = typeof req.body.otp === "string" ? req.body.otp : "";

    if (!phone || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid phone number and six-digit OTP."
        });
    }

    let connection;

    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            `SELECT id, otp_hash, attempts
             FROM otp_requests
             WHERE phone = ?
               AND consumed_at IS NULL
               AND expires_at > UTC_TIMESTAMP()
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [phone]
        );

        if (!rows.length || rows[0].attempts >= 5) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "OTP is invalid or expired. Request a new one."
            });
        }

        const request = rows[0];
        const suppliedHash = crypto.createHash("sha256").update(otp).digest("hex");

        const matches = crypto.timingSafeEqual(
            Buffer.from(suppliedHash, "hex"),
            Buffer.from(request.otp_hash, "hex")
        );

        if (!matches) {
            await connection.execute(
                "UPDATE otp_requests SET attempts = attempts + 1 WHERE id = ?",
                [request.id]
            );

            await connection.commit();

            return res.status(400).json({
                success: false,
                message: "Incorrect OTP."
            });
        }

        await connection.execute(
            "UPDATE otp_requests SET consumed_at = UTC_TIMESTAMP() WHERE id = ?",
            [request.id]
        );

        await connection.execute(
            `INSERT INTO users (phone, phone_verified_at, status)
             VALUES (?, UTC_TIMESTAMP(), 'ACTIVE')
             ON DUPLICATE KEY UPDATE phone_verified_at = UTC_TIMESTAMP()`,
            [phone]
        );

        const [users] = await connection.execute(
            "SELECT id, full_name, phone, status FROM users WHERE phone = ?",
            [phone]
        );

        const user = users[0];

        if (user.status !== "ACTIVE") {
            await connection.rollback();

            return res.status(403).json({
                success: false,
                message: "This account is not active."
            });
        }

        const [roles] = await connection.execute(
            `SELECT r.code
             FROM roles r
             INNER JOIN user_roles ur ON ur.role_id = r.id
             WHERE ur.user_id = ?`,
            [user.id]
        );

        if (roles.length === 0) {
            const [passengerRoles] = await connection.execute(
                "SELECT id FROM roles WHERE code = 'PASSENGER' LIMIT 1"
            );

            if (!passengerRoles.length) {
                throw new Error("PASSENGER role is missing from the database.");
            }

            await connection.execute(
                "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
                [user.id, passengerRoles[0].id]
            );

            roles.push({ code: "PASSENGER" });
        }

        const token = jwt.sign(
            { sub: String(user.id), roles: roles.map(role => role.code) },
            process.env.JWT_SECRET,
            { expiresIn: "2h", issuer: "aasanyatra-api" }
        );

        await connection.commit();

        res.json({
            success: true,
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                full_name: user.full_name,
                phone: user.phone,
                roles: roles.map(role => role.code)
            }
        });
    } catch (error) {
        if (connection) await connection.rollback();

        console.error("OTP verification failed:", error);

        res.status(500).json({
            success: false,
            message: "Unable to verify OTP."
        });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;