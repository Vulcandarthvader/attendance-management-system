// Entry point of the backend.
// 1. Load settings from .env
// 2. Set up Express (the web server) and its routes
// 3. Connect to MongoDB, then start listening for requests
/*
loads .env, so it knows the MongoDB address and JWT secret
creates the Express app
adds cors() and express.json(), so it can read the JSON that React sends
connects each URL prefix to its route file (the three app.use lines)
connects to MongoDB
starts listening on port 5000 and waits for requests
*/
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const courseRoutes = require("./routes/courses");
const attendanceRoutes = require("./routes/attendance");

if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error("Missing MONGO_URI or JWT_SECRET. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();

app.use(cors()); // allow the React app to call this API
app.use(express.json()); // read JSON request bodies into req.body

// Every URL starting with /api/auth goes to routes/auth.js, and so on.
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/attendance", attendanceRoutes);

// Unknown URL
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("Could not connect to MongoDB:", err.message);
    process.exit(1);
  });
