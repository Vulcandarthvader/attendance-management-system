// Protects routes: only logged-in users get through.
// The React app sends:  Authorization: Bearer <token>
// We check the token. If it is valid, we put the user's id on req.userId.

const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Please log in first" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // throws if fake or expired
    req.userId = decoded.id;
    next(); // go on to the actual route
  } catch {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
}

module.exports = auth;
