
const jwt = require("jsonwebtoken");
const db = require("../db");

// Verify the login token and confirm the user is active.
async function authenticateToken(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Please log in to continue."
        });
    }

    const token = authorization.slice(7);

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "aasanyatra-api"
        });

        const [users] = await db.execute(
            "SELECT id, phone, status FROM users WHERE id = ? LIMIT 1",
            [decoded.sub]
        );

        if (!users.length || users[0].status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive or unavailable."
            });
        }

        const [roles] = await db.execute(
            `SELECT r.code
             FROM roles r
             INNER JOIN user_roles ur ON ur.role_id = r.id
             WHERE ur.user_id = ?`,
            [users[0].id]
        );

        req.user = {
            id: users[0].id,
            phone: users[0].phone,
            roles: roles.map(role => role.code)
        };

        next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError") {
            return res.status(401).json({
                success: false,
                message: "Your login session is invalid or expired. Please log in again."
            });
        }

        console.error("Authentication error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Unable to authenticate this request."
        });
    }
}

// Allow access only to the specified roles.
function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Please log in to continue."
            });
        }

        const allowed = req.user.roles.some(role =>
            allowedRoles.includes(role)
        );

        if (!allowed) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to access this feature."
            });
        }

        next();
    };
}

module.exports = {
    authenticateToken,
    authorizeRoles
};