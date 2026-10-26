// A subject, e.g. "DBMS".
// totalClasses  = how many classes this subject will have in the whole semester
// minAttendance = the percentage you must keep, e.g. 75

const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    totalClasses: { type: Number, required: true, min: 1 },
    minAttendance: { type: Number, default: 75, min: 1, max: 100 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema);
