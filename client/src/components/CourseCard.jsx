/**
 * One course, with the number that actually answers the question.
 *
 * The percentage is the context; the headline is how many classes you can still
 * miss, or how many you must attend to recover. v1 showed a two-column table of
 * percentages, which tells you where you are but not what to do about it.
 */

import Ring from "./Ring.jsx";
import { STATUS_LABEL, pct, weekdayList } from "../lib/format.js";

export default function CourseCard({ row, onOpen }) {
  const { course, currentPct, threshold, status, canSkip, mustAttend, message } = row;
  const headline =
    status === "recovering" || status === "unrecoverable"
      ? { figure: mustAttend === Infinity ? "—" : mustAttend, caption: "classes needed in a row" }
      : { figure: canSkip, caption: canSkip === 1 ? "class you can miss" : "classes you can miss" };

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{course.code}</h3>
          <p className="dim">{course.name}</p>
        </div>
        <span className={`pill ${status}`}>
          <i className="dot" />
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="row" style={{ gap: 18, alignItems: "center" }}>
        <Ring value={currentPct} threshold={Math.round(threshold * 100)} status={status} />
        <div style={{ flex: 1, minWidth: 120 }}>
          <div className="hero-figure">{headline.figure}</div>
          <div className="muted">{headline.caption}</div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14 }}>{message}</p>

      {/* A fixed grid rather than a wrapping row, so a card with a cancelled
          count stays the same height as one without. */}
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, margin: "14px 0 0" }}>
        <Stat label="Attended" value={`${row.attended}/${row.held}`} />
        <Stat label="Left" value={row.remaining} />
        <Stat label="Cancelled" value={row.cancelled || "—"} />
        <Stat label="Best case" value={pct(row.bestCasePct, 0)} />
      </dl>

      {row.unmarkedCount > 0 && (
        <p className="dim" style={{ marginTop: 12 }}>
          {row.unmarkedCount} past {row.unmarkedCount === 1 ? "class is" : "classes are"} still unmarked —
          they count as missed until you log them.
        </p>
      )}

      <div className="row spread" style={{ marginTop: 14 }}>
        <span className="dim">Meets {weekdayList(course.weekdays)}</span>
        {onOpen && (
          <button className="ghost sm" onClick={() => onOpen(course)}>
            History
          </button>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="stat-label">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </div>
  );
}
