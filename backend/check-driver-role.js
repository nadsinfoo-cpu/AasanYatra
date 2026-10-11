const db = require("./db");

async function main() {
    try {
        const [rows] = await db.execute(
            "SELECT id, code FROM roles WHERE code = ?",
            ["DRIVER"]
        );

        console.log("DRIVER role result:", rows);
    } catch (error) {
        console.error("Database query failed:", error.message);
        process.exitCode = 1;
    } finally {
        if (typeof db.end === "function") {
            await db.end();
        }
    }
}

main();
