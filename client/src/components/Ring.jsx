/**
 * Attendance ring.
 *
 * A single-value chart, so it carries no categorical colour: the arc is
 * coloured by *status* and the course is named beside it. The threshold is
 * drawn as a tick on the track, because a percentage without the bar it must
 * clear is only half the information.
 */

import { STATUS_LABEL, statusColor } from "../lib/format.js";

export default function Ring({ value, threshold = 75, status = "safe", size = 108, stroke = 9 }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = value ?? 0;
  const dash = (Math.min(100, Math.max(0, shown)) / 100) * circumference;

  // Threshold tick, measured round the same circle so it lines up exactly.
  const tickAngle = (threshold / 100) * 2 * Math.PI - Math.PI / 2;
  const inner = radius - stroke / 2 - 1;
  const outer = radius + stroke / 2 + 1;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`${value === null ? "No data" : `${value.toFixed(1)} percent`}, target ${threshold} percent, ${STATUS_LABEL[status] ?? status}`}>
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      {value !== null && (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={statusColor(status)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      )}
      <line
        x1={cx + inner * Math.cos(tickAngle)}
        y1={cy + inner * Math.sin(tickAngle)}
        x2={cx + outer * Math.cos(tickAngle)}
        y2={cy + outer * Math.sin(tickAngle)}
        stroke="var(--text)"
        strokeWidth="2"
      />
      <text x={cx} y={cy - 1} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: size * 0.22, fontWeight: 650, fill: "var(--text)" }}>
        {value === null ? "—" : `${Math.round(value)}%`}
      </text>
      <text x={cx} y={cy + size * 0.17} textAnchor="middle"
            style={{ fontSize: size * 0.105, fill: "var(--text-3)" }}>
        target {threshold}%
      </text>
    </svg>
  );
}
