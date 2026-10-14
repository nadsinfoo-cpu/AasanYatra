
const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/locations/cities?search=Delhi
router.get("/cities", async (req, res) => {
  try {
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";

    if (search.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Search must be 100 characters or fewer.",
      });
    }

    const [rows] = await db.execute(
      `SELECT id, city_name, state_name, country_code
       FROM cities
       WHERE is_active = 1
         AND city_name LIKE ?
       ORDER BY
         CASE WHEN city_name = ? THEN 0 ELSE 1 END,
         city_name ASC
       LIMIT 30`,
      [`%${search}%`, search]
    );

    return res.json({
      success: true,
      source: "DATABASE",
      data: rows,
    });
  } catch (error) {
    console.error("City search error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to search cities.",
    });
  }
});

// GET /api/locations/settings
router.get("/settings", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT setting_value
       FROM app_settings
       WHERE setting_key = ?`,
      ["location_maps_enabled"]
    );

    return res.json({
      success: true,
      data: {
        location_maps_enabled:
          rows[0]?.setting_value === "true",
      },
    });
  } catch (error) {
    console.error("Location settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load location settings.",
    });
  }
});

module.exports = router;
