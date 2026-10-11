const db = require("./db");

async function main() {
    try {
        const [rows] = await db.execute(
            "SHOW COLUMNS FROM bookings LIKE 'driver_id'"
        );
        console.table(rows);

        const [indexes] = await db.execute(
            "SHOW INDEX FROM bookings WHERE Key_name = 'idx_booking_driver'"
        );
        console.table(indexes);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
