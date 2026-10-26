// One subject: stats, mark attendance for any past date,
// edit total classes / minimum %, see and delete records, delete the subject.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, today } from "../api";

export default function CourseDetail() {
  const { id } = useParams(); // the :id from the URL
  const navigate = useNavigate();

  const [data, setData] = useState(null); // { course, stats, records }
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState({ totalClasses: "", minAttendance: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    try {
      const result = await api(`/courses/${id}`);
      setData(result);
      setEdit({ totalClasses: result.course.totalClasses, minAttendance: result.course.minAttendance });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function mark(status) {
    setError("");
    setInfo("");
    try {
      const res = await api("/attendance", { method: "POST", body: { courseId: id, date, status } });
      setInfo(res.updated ? `Updated ${date} to ${status}.` : `Marked ${date} as ${status}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    try {
      await api(`/courses/${id}`, {
        method: "PUT",
        body: { totalClasses: Number(edit.totalClasses), minAttendance: Number(edit.minAttendance) },
      });
      setInfo("Saved.");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRecord(recordId) {
    try {
      await api(`/attendance/${recordId}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteCourse() {
    if (!window.confirm("Delete this subject and all its attendance?")) return;
    try {
      await api(`/courses/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return <p>{error || "Loading..."}</p>;

  const { course, stats, records } = data;

  return (
    <div>
      <button className="link" onClick={() => navigate("/")}>← Back</button>
      <h2>{course.name}</h2>

      {error && <p className="error">{error}</p>}
      {info && <p className="success">{info}</p>}

      {/* Stats */}
      <div className={`card course-card ${stats.status}`}>
        <div className="stats">
          <div><span className="label">Attendance</span><b>{stats.percentage === null ? "--" : `${stats.percentage.toFixed(1)}%`}</b></div>
          <div><span className="label">Present</span><b>{stats.present}</b></div>
          <div><span className="label">Absent</span><b>{stats.absent}</b></div>
          <div><span className="label">Remaining</span><b>{stats.remaining}</b></div>
          <div><span className="label">Can skip (k)</span><b>{stats.canSkip}</b></div>
          <div><span className="label">Must attend (m)</span><b>{stats.mustAttend}</b></div>
        </div>
        <p className="message">{stats.message}</p>
      </div>

      {/* Mark attendance */}
      <div className="card">
        <h3>Mark attendance</h3>
        <div className="inline-form">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <button onClick={() => mark("present")}>Present</button>
          <button className="secondary" onClick={() => mark("absent")}>Absent</button>
        </div>
        <p className="muted">Marking the same date again changes it.</p>
      </div>

      {/* Edit settings */}
      <div className="card">
        <h3>Settings</h3>
        <form onSubmit={saveSettings} className="inline-form">
          <label>
            Total classes
            <input type="number" min="1" value={edit.totalClasses} onChange={(e) => setEdit({ ...edit, totalClasses: e.target.value })} />
          </label>
          <label>
            Minimum %
            <input type="number" min="1" max="100" value={edit.minAttendance} onChange={(e) => setEdit({ ...edit, minAttendance: e.target.value })} />
          </label>
          <button type="submit">Save</button>
        </form>
      </div>

      {/* History */}
      <div className="card">
        <h3>History ({records.length})</h3>
        {records.length === 0 && <p className="muted">No classes marked yet.</p>}
        <ul className="history">
          {records.map((r) => (
            <li key={r._id}>
              <span>{r.date}</span>
              <span className={`badge ${r.status === "present" ? "safe" : "unrecoverable"}`}>{r.status}</span>
              <button className="link" onClick={() => deleteRecord(r._id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>

      <button className="danger" onClick={deleteCourse}>Delete subject</button>
    </div>
  );
}
