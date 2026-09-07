/**
 * Semester and courses.
 *
 * This screen is what removes the hardcoded dates from the code. v1 had the
 * markable window written into a JSX attribute and the five course codes
 * written into the Mongoose schema, so a new semester meant editing source and
 * migrating the database.
 */

import { useEffect, useState } from "react";

import Banner from "../components/Banner.jsx";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { WEEKDAYS, prettyDate, weekdayList } from "../lib/format.js";

const BLANK_COURSE = { code: "", name: "", weekdays: [] };

export default function Settings() {
  const { user, setUser } = useAuth();
  const [semester, setSemester] = useState(null);
  const [courses, setCourses] = useState([]);
  const [draft, setDraft] = useState(BLANK_COURSE);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [sem, list] = await Promise.all([api.getSemester(), api.listCourses()]);
        setSemester(
          sem.semester ?? {
            name: "Semester 1",
            startDate: "",
            endDate: "",
            threshold: user?.threshold ?? 0.75,
            holidays: [],
          },
        );
        setCourses(list.courses);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [user?.threshold]);

  function flash(text) {
    setMessage(text);
    setError(null);
    setTimeout(() => setMessage(null), 2500);
  }

  async function saveSemester(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.saveSemester({
        name: semester.name,
        startDate: semester.startDate,
        endDate: semester.endDate,
        threshold: Number(semester.threshold),
        holidays: semester.holidays ?? [],
      });
      setSemester(res.semester);
      flash("Semester saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCourse(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        const res = await api.updateCourse(editingId, draft);
        setCourses((cs) => cs.map((c) => (c.id === editingId ? res.course : c)));
        flash(`${res.course.code} updated.`);
      } else {
        const res = await api.createCourse(draft);
        setCourses((cs) => [...cs, res.course].sort((a, b) => a.code.localeCompare(b.code)));
        flash(`${res.course.code} added.`);
      }
      setDraft(BLANK_COURSE);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCourse(course) {
    if (!window.confirm(`Delete ${course.code}? Its attendance records go too.`)) return;
    try {
      await api.deleteCourse(course.id);
      setCourses((cs) => cs.filter((c) => c.id !== course.id));
      flash(`${course.code} deleted.`);
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleDay(day) {
    setDraft((d) => ({
      ...d,
      weekdays: d.weekdays.includes(day) ? d.weekdays.filter((x) => x !== day) : [...d.weekdays, day].sort(),
    }));
  }

  function addHoliday() {
    setSemester((s) => ({ ...s, holidays: [...(s.holidays ?? []), { date: s.startDate, name: "" }] }));
  }

  if (!semester) return <div className="skeleton" style={{ height: 300 }} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">The timetable everything else is derived from.</p>
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {message && <Banner kind="success">{message}</Banner>}

      <div className="grid grid-2" style={{ marginTop: 14, alignItems: "start" }}>
        <form className="card" onSubmit={saveSemester}>
          <h2 style={{ marginBottom: 14 }}>Semester</h2>

          <div className="field">
            <label htmlFor="sem-name">Name</label>
            <input id="sem-name" type="text" required value={semester.name}
                   onChange={(e) => setSemester({ ...semester, name: e.target.value })} />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="sem-start">First day</label>
              <input id="sem-start" type="date" required value={semester.startDate}
                     onChange={(e) => setSemester({ ...semester, startDate: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sem-end">Last day</label>
              <input id="sem-end" type="date" required value={semester.endDate}
                     onChange={(e) => setSemester({ ...semester, endDate: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="sem-threshold">
              Required attendance: {Math.round((semester.threshold ?? 0.75) * 100)}%
            </label>
            <input id="sem-threshold" type="range" min="0.5" max="1" step="0.05"
                   value={semester.threshold ?? 0.75}
                   onChange={(e) => setSemester({ ...semester, threshold: Number(e.target.value) })} />
            <p className="dim">Most Indian universities require 75%. Some departments set 80%.</p>
          </div>

          <div className="field">
            <div className="row spread">
              <label style={{ marginBottom: 0 }}>Holidays</label>
              <button type="button" className="ghost sm" onClick={addHoliday}>Add</button>
            </div>
            {(semester.holidays ?? []).length === 0 && (
              <p className="dim">None. Holidays are removed from every subject's class count.</p>
            )}
            {(semester.holidays ?? []).map((h, i) => (
              <div className="row" key={i} style={{ marginTop: 6 }}>
                <input type="date" value={h.date} style={{ flex: "0 0 165px" }}
                       onChange={(e) => updateHoliday(setSemester, i, { date: e.target.value })} />
                <input type="text" placeholder="Name (optional)" value={h.name ?? ""} style={{ flex: 1 }}
                       onChange={(e) => updateHoliday(setSemester, i, { name: e.target.value })} />
                <button type="button" className="danger sm"
                        onClick={() => setSemester((s) => ({ ...s, holidays: s.holidays.filter((_, j) => j !== i) }))}>
                  ×
                </button>
              </div>
            ))}
          </div>

          <button className="primary" type="submit" disabled={busy}>Save semester</button>
        </form>

        <div className="stack">
          <form className="card" onSubmit={submitCourse}>
            <h2 style={{ marginBottom: 14 }}>{editingId ? "Edit subject" : "Add a subject"}</h2>

            <div className="field-row">
              <div className="field" style={{ flex: "0 0 130px" }}>
                <label htmlFor="course-code">Code</label>
                <input id="course-code" type="text" required maxLength={16} placeholder="DBMS"
                       value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="course-name">Name</label>
                <input id="course-name" type="text" required placeholder="Database Management Systems"
                       value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
            </div>

            <div className="field">
              <label>Days it meets</label>
              <div className="daypick">
                {WEEKDAYS.map((label, day) => (
                  <button key={day} type="button" aria-pressed={draft.weekdays.includes(day)}
                          onClick={() => toggleDay(day)}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="dim" style={{ marginTop: 6 }}>
                This is how the app knows how many classes exist — and which dates it will accept.
              </p>
            </div>

            <div className="row">
              <button className="primary" type="submit" disabled={busy || !draft.weekdays.length}>
                {editingId ? "Save changes" : "Add subject"}
              </button>
              {editingId && (
                <button type="button" className="ghost"
                        onClick={() => { setEditingId(null); setDraft(BLANK_COURSE); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Your subjects</h2>
            {courses.length === 0 ? (
              <p className="muted">None yet.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {courses.map((c) => (
                  <li key={c.id} className="row spread"
                      style={{ padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
                    <div>
                      <strong>{c.code}</strong> <span className="dim">{c.name}</span>
                      <div className="dim">{weekdayList(c.weekdays)}</div>
                    </div>
                    <div className="row">
                      <button className="sm" onClick={() => { setEditingId(c.id); setDraft({ code: c.code, name: c.name, weekdays: c.weekdays }); }}>
                        Edit
                      </button>
                      <button className="danger sm" onClick={() => removeCourse(c)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function updateHoliday(setSemester, index, patch) {
  setSemester((s) => ({
    ...s,
    holidays: s.holidays.map((h, i) => (i === index ? { ...h, ...patch } : h)),
  }));
}
