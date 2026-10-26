// Subjects (all routes need a token)
//   GET    /api/courses       list my courses + stats
//   POST   /api/courses       add a course
//   GET    /api/courses/:id   one course + stats + its attendance records
//   PUT    /api/courses/:id   edit a course
//   DELETE /api/courses/:id   delete a course and its records

const express = require("express");
const mongoose = require("mongoose");
const Course = require("../models/Course");
const Attendance = require("../models/Attendance");
const auth = require("../middleware/auth");
const calculateStats = require("../utils/calculate");

const router = express.Router();
router.use(auth); // every route below needs a valid token

// Count present/absent for one course, then run the formulas
async function getStats(course) {
  const present = await Attendance.countDocuments({ course: course._id, status: "present" });
  const absent = await Attendance.countDocuments({ course: course._id, status: "absent" });
  return calculateStats({
    present,
    absent,
    totalClasses: course.totalClasses,
    minAttendance: course.minAttendance,
  });
}

// Check the course form fields. Returns an error message, or null if OK.
function checkCourseInput({ name, totalClasses, minAttendance }) {
  if (!name || !name.trim()) return "Course name is required";
  if (!Number.isInteger(totalClasses) || totalClasses < 1) return "Total classes must be a whole number, at least 1";
  if (minAttendance !== undefined && (!Number.isInteger(minAttendance) || minAttendance < 1 || minAttendance > 100)) {
    return "Minimum attendance must be a whole number from 1 to 100";
  }
  return null;
}

// List my courses, each with its stats
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find({ user: req.userId }).sort({ createdAt: 1 });
    const result = [];
    for (const course of courses) {
      result.push({ ...course.toObject(), stats: await getStats(course) });
    }
    res.json({ courses: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Add a course
router.post("/", async (req, res) => {
  try {
    const name = req.body.name;
    const totalClasses = Number(req.body.totalClasses);
    const minAttendance = req.body.minAttendance === undefined ? 75 : Number(req.body.minAttendance);

    const error = checkCourseInput({ name, totalClasses, minAttendance });
    if (error) return res.status(400).json({ message: error });

    const course = await Course.create({ user: req.userId, name: name.trim(), totalClasses, minAttendance });
    res.status(201).json({ course });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// One course with stats and all its records (newest first)
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Course not found" });

    // Filtering by user too means you can never open someone else's course
    const course = await Course.findOne({ _id: req.params.id, user: req.userId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const records = await Attendance.find({ course: course._id }).sort({ date: -1 });
    res.json({ course, stats: await getStats(course), records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Edit a course
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Course not found" });

    const course = await Course.findOne({ _id: req.params.id, user: req.userId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    const name = req.body.name ?? course.name;
    const totalClasses = Number(req.body.totalClasses ?? course.totalClasses);
    const minAttendance = Number(req.body.minAttendance ?? course.minAttendance);

    const error = checkCourseInput({ name, totalClasses, minAttendance });
    if (error) return res.status(400).json({ message: error });

    // Total cannot be less than the classes already recorded
    const held = await Attendance.countDocuments({ course: course._id });
    if (totalClasses < held) {
      return res.status(400).json({ message: `You already recorded ${held} classes, so total cannot be less than that` });
    }

    course.name = name.trim();
    course.totalClasses = totalClasses;
    course.minAttendance = minAttendance;
    await course.save();

    res.json({ course });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete a course and all of its attendance records
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Course not found" });

    const course = await Course.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!course) return res.status(404).json({ message: "Course not found" });

    await Attendance.deleteMany({ course: course._id });
    res.json({ message: "Course deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
