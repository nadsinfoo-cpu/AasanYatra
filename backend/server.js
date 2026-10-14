
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./db");
const authRoutes = require("./routes/auth");
const bookingRoutes = require("./routes/bookings");
const { authenticateToken } = require("./middleware/auth");
const app = express();
const locationRoutes = require("./routes/locations");

app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use("/api/locations", locationRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to AasanYatra API"
    });
});

app.get("/api/health", async (req, res) => {
    try {
        await db.query("SELECT 1");

        res.json({
            success: true,
            message: "AasanYatra API is working",
            database: "Connected"
        });
    } catch (error) {
        console.error("Database error:", error.message);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

app.get("/api/roles", async (req, res) => {
    try {
        const [roles] = await db.query(
            "SELECT id, code, name FROM roles ORDER BY id"
        );

        res.json({ success: true, data: roles });
    } catch (error) {
        console.error("Roles error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not fetch roles"
        });
    }
});
// Return the authenticated user's current profile and roles.
app.get("/api/auth/me", authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            phone: req.user.phone,
            roles: req.user.roles
        }
    });
});
// Mobile OTP authentication
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/driver-bookings", require("./routes/driverBookings"));
app.use("/api/driver-ride-requests", require("./routes/driverRideRequests"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin/ride-requests", require("./routes/adminRideRequests"));

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`AasanYatra API running at http://localhost:${PORT}`);
});

// Gracefully close database connections when stopping the server.
process.on("SIGINT", async () => {
    server.close();
    await db.end();
    process.exit(0);
});
