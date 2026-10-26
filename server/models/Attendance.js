// One class on one day: were you present or absent?
// The date is stored as a "YYYY-MM-DD" string so time zones can never shift the day.
/*
models/: the shape of the data. These files don’t do anything on their own. They describe what a document looks like, and give the routes ready-made functions like Course.find() and Course.create().

User.js: name, email, password hash
Course.js: which user owns it, name, totalClasses, minAttendance
Attendance.js: which user, which course, date, present or absent
*/
const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    date: { type: String, required: true }, // e.g. "2026-10-26"
    status: { type: String, enum: ["present", "absent"], required: true },
  },
  { timestamps: true }
);

// Only ONE record per course per day. MongoDB itself rejects a duplicate.
attendanceSchema.index({ course: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
