const db = require("./db");

async function main() {
    try {
        const [columns] = await db.execute(
            "SHOW COLUMNS FROM bookings LIKE 'driver_id'"
        );

        if (columns.length > 0) {
            console.log("driver_id already exists. No changes made.");
            return;
        }

        await db.execute(`
            ALTER TABLE bookings
                ADD COLUMN driver_id BIGINT UNSIGNED NULL
                    AFTER passenger_id,
                ADD INDEX idx_booking_driver (driver_id),
                ADD CONSTRAINT fk_booking_driver
                    FOREIGN KEY (driver_id)
                    REFERENCES driver_profiles(id)
                    ON DELETE RESTRICT
        `);

        console.log("SUCCESS: driver_id added to bookings.");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
