const db = require("./db");

async function main() {
    try {
        const [rows] = await db.execute(
            "SELECT id, code, name FROM roles ORDER BY id"
        );
        console.table(rows);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
