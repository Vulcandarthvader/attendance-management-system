/**
 * Calendar heatmap of marked days.
 *
 * Status colours, with a legend and a text label on hover — colour alone never
 * carries the meaning. Weeks run down each column, Monday at the top, which is
 * how a term timetable is read.
 */

import { WEEKDAYS, prettyDate } from "../lib/format.js";

export default function Heatmap({ days, startDate, endDate }) {
  if (!startDate || !endDate) return null;

  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells = [];

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  // Back up to the Monday on or before the semester start so columns align.
  const cursor = new Date(start);
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const day = byDate.get(iso);
    cells.push({ iso, day, inRange: cursor >= start });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return (
    <div>
      <div className="table-scroll">
        <div className="heat" style={{ paddingBottom: 4 }}>
          {cells.map(({ iso, day, inRange }) => {
            const cls = !inRange || !day ? "" : classify(day);
            const label = day
              ? `${prettyDate(iso)}: ${day.items.map((i) => `${i.code} ${i.status}`).join(", ")}`
              : prettyDate(iso);
            return <i key={iso} className={cls} title={label} />;
          })}
        </div>
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "var(--good)" }} />All present</span>
        <span><i style={{ background: "var(--warning)" }} />Mixed</span>
        <span><i style={{ background: "var(--critical)" }} />All absent</span>
        <span><i style={{ background: "var(--line-strong)" }} />Cancelled</span>
        <span><i style={{ background: "var(--line)" }} />Nothing marked</span>
      </div>
    </div>
  );
}

function classify(day) {
  if (day.present > 0 && day.absent > 0) return "mixed";
  if (day.absent > 0) return "absent";
  if (day.present > 0) return "present";
  if (day.cancelled > 0) return "cancelled";
  return "";
}
