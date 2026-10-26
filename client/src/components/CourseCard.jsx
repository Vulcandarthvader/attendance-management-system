// One subject on the dashboard: percentage, the k/m message,
// and quick "Present today" / "Absent today" buttons.

import { Link } from "react-router-dom";

export default function CourseCard({ course, onMark }) {
  const s = course.stats;

  return (
    <div className={`card course-card ${s.status}`}>
      <div className="row">
        <h3>{course.name}</h3>
        <span className={`badge ${s.status}`}>{s.status}</span>
      </div>

      <p className="big">{s.percentage === null ? "--" : `${s.percentage.toFixed(1)}%`}</p>
      <p className="muted">
        Attended {s.present} of {s.held} · {s.remaining} left of {s.totalClasses} · need {s.minAttendance}%
      </p>

      <p className="message">{s.message}</p>

      <div className="row">
        <button onClick={() => onMark(course._id, "present")}>Present today</button>
        <button className="secondary" onClick={() => onMark(course._id, "absent")}>Absent today</button>
        <Link to={`/course/${course._id}`}>Details →</Link>
      </div>
    </div>
  );
}
