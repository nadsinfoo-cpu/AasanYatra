const db = require("./db");

async function main() {
    try {
        const [tables] = await db.execute("SHOW TABLES");
        console.log("DATABASE TABLES:");
        console.table(tables);

        for (const table of ["bookings", "driver_profiles"]) {
            const [rows] = await db.execute(
                `SHOW CREATE TABLE \`${table}\``
            );

            console.log(`\nTABLE STRUCTURE: ${table}`);
            console.log(rows[0]["Create Table"]);
        }
    } catch (error) {
        console.error("Database inspection failed:", error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
