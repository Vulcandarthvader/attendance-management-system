import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Banner from "../components/Banner.jsx";
import Heatmap from "../components/Heatmap.jsx";
import { api } from "../lib/api.js";
import { useAsync } from "../lib/useAsync.js";
import { prettyDate } from "../lib/format.js";

export default function History() {
  const [params, setParams] = useSearchParams();
  const courseId = params.get("course") ?? "";

  const overview = useAsync(() => api.overview(), []);
  const calendar = useAsync(() => api.calendar(), []);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const courses = overview.data?.courses?.map((r) => r.course) ?? [];
  const codeById = useMemo(() => new Map(courses.map((c) => [c.id, c.code])), [courses]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listAttendance(courseId ? { courseId } : {});
      setRecords([...res.records].reverse()); // newest first
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function remove(id) {
    try {
      await api.deleteAttendance(id);
      await load();
      calendar.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const semester = overview.data?.semester;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>History</h1>
          <p className="muted">Every class you have logged, and the shape of the semester so far.</p>
        </div>
        <div style={{ minWidth: 200 }}>
          <label htmlFor="course-filter">Subject</label>
          <select id="course-filter" value={courseId}
                  onChange={(e) => setParams(e.target.value ? { course: e.target.value } : {})}>
            <option value="">All subjects</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}

      {semester && (
        <section className="card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div>
              <h2>Semester at a glance</h2>
              <p className="dim">Each square is a day. Hover for what was marked.</p>
            </div>
          </div>
          {calendar.loading ? (
            <div className="skeleton" style={{ height: 110 }} />
          ) : (
            <Heatmap days={calendar.data?.days ?? []} startDate={semester.startDate} endDate={semester.endDate} />
          )}
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Records</h2>
          <span className="dim">{records.length} entries</span>
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 140 }} />
        ) : records.length === 0 ? (
          <p className="muted">Nothing logged yet.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{prettyDate(typeof r.date === "string" ? r.date.slice(0, 10) : r.date)}</td>
                    <td>{codeById.get(String(r.courseId)) ?? "—"}</td>
                    <td>
                      <span className={`pill ${r.status === "present" ? "safe" : r.status === "absent" ? "unrecoverable" : ""}`}>
                        <i className="dot" />
                        {r.status}
                      </span>
                    </td>
                    <td className="num">
                      <button className="danger sm" onClick={() => remove(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
