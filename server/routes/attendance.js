// Marking attendance (all routes need a token)
//   POST   /api/attendance       mark present/absent for a course on a date
//   DELETE /api/attendance/:id   remove one record

const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Attendance = require("../models/Attendance");
const auth = require("../middleware/auth");

const router = express.Router();
router.use(auth);

// Today's date as "YYYY-MM-DD" in the computer's local time zone
function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Mark attendance. If the same course + date is already marked, we UPDATE it
// (so you can fix a mistake) instead of creating a duplicate.
router.post("/", async (req, res) => {
  try {
    const { courseId, date, status } = req.body;

    // 1. Check the input
    if (!["present", "absent"].includes(status)) {
      return res.status(400).json({ message: "Status must be present or absent" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      return res.status(400).json({ message: "Date must look like YYYY-MM-DD" });
    }
    if (date > todayString()) {
      // "YYYY-MM-DD" strings sort like dates, so > works
      return res.status(400).json({ message: "You cannot mark a future class" });
    }
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(404).json({ message: "Course not found" });
    }

    // 2. The course must exist and belong to this user
    const course = await Course.findOne({ _id: courseId, user: req.userId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    // 3. Already marked that day? Just change the status.
    const existing = await Attendance.findOne({ course: course._id, date });
    if (existing) {
      existing.status = status;
      await existing.save();
      return res.json({ record: existing, updated: true });
    }

    // 4. New record: do not go past the total number of classes
    const held = await Attendance.countDocuments({ course: course._id });
    if (held >= course.totalClasses) {
      return res.status(400).json({
        message: `All ${course.totalClasses} classes are already recorded. Increase the total if there are more.`,
      });
    }

    const record = await Attendance.create({ user: req.userId, course: course._id, date, status });
    res.status(201).json({ record, updated: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete one record
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Record not found" });

    const record = await Attendance.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!record) return res.status(404).json({ message: "Record not found" });

    res.json({ message: "Record deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
