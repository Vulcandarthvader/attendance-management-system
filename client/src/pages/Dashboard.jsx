// Home page: list of subjects with their stats, and a form to add a subject

import { useEffect, useState } from "react";
import { api, today } from "../api";
import CourseCard from "../components/CourseCard.jsx";

export default function Dashboard() {
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({ name: "", totalClasses: "", minAttendance: 75 });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Load all courses (with stats) from the server
  async function loadCourses() {
    try {
      const data = await api("/courses");
      setCourses(data.courses);
    } catch (err) {
      setError(err.message);
    }
  }

  // Run once when the page opens
  useEffect(() => {
    loadCourses();
  }, []);

  async function addCourse(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/courses", {
        method: "POST",
        body: {
          name: form.name,
          totalClasses: Number(form.totalClasses),
          minAttendance: Number(form.minAttendance),
        },
      });
      setForm({ name: "", totalClasses: "", minAttendance: 75 });
      loadCourses(); // refresh the list
    } catch (err) {
      setError(err.message);
    }
  }

  // Quick mark for today from a course card
  async function markToday(courseId, status) {
    setError("");
    setInfo("");
    try {
      const data = await api("/attendance", {
        method: "POST",
        body: { courseId, date: today(), status },
      });
      setInfo(data.updated ? "Today's entry updated." : "Marked for today.");
      loadCourses(); // numbers change, so reload
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2>My subjects</h2>
      {error && <p className="error">{error}</p>}
      {info && <p className="success">{info}</p>}

      {courses.length === 0 && <p className="muted">No subjects yet. Add one below.</p>}

      <div className="grid">
        {courses.map((course) => (
          <CourseCard key={course._id} course={course} onMark={markToday} />
        ))}
      </div>

      <div className="card">
        <h3>Add a subject</h3>
        <form onSubmit={addCourse} className="inline-form">
          <input
            placeholder="Subject name (e.g. DBMS)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="number"
            min="1"
            placeholder="Total classes in semester"
            value={form.totalClasses}
            onChange={(e) => setForm({ ...form, totalClasses: e.target.value })}
            required
          />
          <input
            type="number"
            min="1"
            max="100"
            placeholder="Minimum %"
            value={form.minAttendance}
            onChange={(e) => setForm({ ...form, minAttendance: e.target.value })}
            required
          />
          <button type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
