/**
 * Marking attendance.
 *
 * The date picker asks the server which classes exist on the chosen day rather
 * than deciding for itself. That is what keeps the two in step: v1 had the
 * weekend rule in an onChange handler and the semester window in a JSX
 * attribute, so the browser and the API could disagree — and only the browser's
 * opinion was visible to the user.
 */

import { useEffect, useState } from "react";

import Banner from "../components/Banner.jsx";
import { api } from "../lib/api.js";
import { prettyDate, todayIso } from "../lib/format.js";

const STATUSES = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "cancelled", label: "Cancelled" },
];

export default function Mark() {
  const [date, setDate] = useState(todayIso());
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .agenda(date)
      .then((res) => !cancelled && setAgenda(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  async function mark(courseId, status) {
    setSavingId(courseId);
    setError(null);
    try {
      await api.mark({ courseId, date, status });
      const refreshed = await api.agenda(date);
      setAgenda(refreshed);
      setSaved(`Saved for ${prettyDate(date)}.`);
      setTimeout(() => setSaved(null), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  async function markAllPresent() {
    const pending = (agenda?.items ?? []).filter((i) => i.status === null);
    if (!pending.length) return;
    setSavingId("all");
    try {
      const res = await api.markMany(
        pending.map((i) => ({ courseId: i.course.id, date, status: "present" })),
      );
      setAgenda(await api.agenda(date));
      setSaved(`Marked ${res.saved} ${res.saved === 1 ? "class" : "classes"} present.`);
      setTimeout(() => setSaved(null), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  const items = agenda?.items ?? [];
  const pending = items.filter((i) => i.status === null).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mark attendance</h1>
          <p className="muted">Pick a day and log each class. Marking again just corrects it.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="field-row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <label htmlFor="date">Date</label>
            <input id="date" type="date" value={date} max={todayIso()}
                   onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="row" style={{ flex: "0 0 auto", gap: 8 }}>
            <button className="sm" onClick={() => setDate(todayIso())}>Today</button>
            <button className="sm" onClick={() => setDate(shift(date, -1))}>‹ Previous day</button>
            <button className="sm" onClick={() => setDate(shift(date, 1))} disabled={date >= todayIso()}>
              Next day ›
            </button>
          </div>
          {pending > 1 && (
            <button className="primary" onClick={markAllPresent} disabled={savingId === "all"}>
              Mark all {pending} present
            </button>
          )}
        </div>
      </div>

      {error && <Banner kind="error" onDismiss={() => setError(null)}>{error}</Banner>}
      {saved && <Banner kind="success">{saved}</Banner>}

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginBottom: 12 }}>{prettyDate(date)}</h2>

        {loading ? (
          <div className="stack">
            <div className="skeleton" style={{ height: 52 }} />
            <div className="skeleton" style={{ height: 52 }} />
          </div>
        ) : items.length === 0 ? (
          <p className="muted">
            No classes scheduled on this day. It may be a weekend, a holiday, or outside the semester —
            the server decides, so this always matches what it will accept.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {items.map((item) => (
              <li key={item.course.id}
                  style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
                           padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ flex: "1 1 180px" }}>
                  <strong>{item.course.code}</strong>
                  <div className="dim">{item.course.name}</div>
                </div>
                <div className="row" role="group" aria-label={`Attendance for ${item.course.code}`}>
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      className={item.status === s.value ? "primary sm" : "sm"}
                      aria-pressed={item.status === s.value}
                      disabled={savingId === item.course.id}
                      onClick={() => mark(item.course.id, s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function shift(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
