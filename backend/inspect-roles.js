const db = require("./db");

async function main() {
    try {
        for (const table of ["users", "roles", "user_roles"]) {
            const [rows] = await db.execute(
                `SHOW CREATE TABLE \`${table}\``
            );

            console.log(`\nTABLE STRUCTURE: ${table}`);
            console.log(rows[0]["Create Table"]);
        }

        const [rows] = await db.execute(`
            SELECT u.id, u.phone, r.name AS role
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE u.id = 7
        `);

        console.log("\nUSER 7 ROLES:");
        console.table(rows);
    } catch (error) {
        console.error("Inspection failed:", error.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
}

main();
