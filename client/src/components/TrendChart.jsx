/**
 * Cumulative attendance, week by week, against the threshold.
 *
 * One series and one reference line, on one axis. The threshold is the whole
 * point of the chart, so it is drawn rather than left to the reader to imagine
 * — and it is what makes the shape meaningful: a line falling towards the rule
 * reads very differently from the same line rising away from it.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { prettyDate } from "../lib/format.js";

export default function TrendChart({ points, thresholdPct = 75 }) {
  if (!points?.length) {
    return <p className="muted">No classes recorded yet — the trend appears once you start marking.</p>;
  }

  const lowest = Math.min(...points.map((p) => p.pct), thresholdPct);
  const domainFloor = Math.max(0, Math.floor((lowest - 8) / 5) * 5);

  return (
    <>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -6 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={prettyDate}
            tick={{ fill: "var(--text-3)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--line-strong)" }}
            minTickGap={28}
          />
          <YAxis
            domain={[domainFloor, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "var(--text-3)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              color: "var(--text)",
              fontSize: 13,
            }}
            labelFormatter={(v) => `Week of ${prettyDate(v)}`}
            formatter={(value, _name, item) => [
              `${value.toFixed(1)}%  (${item.payload.attended}/${item.payload.held})`,
              "Attendance",
            ]}
          />
          <ReferenceLine
            y={thresholdPct}
            stroke="var(--critical)"
            strokeDasharray="4 4"
            label={{
              value: `${thresholdPct}% required`,
              position: "insideTopRight",
              fill: "var(--critical)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="pct"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#trendFill)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* The table view is the accessible equivalent of the chart, not an extra. */}
      <details style={{ marginTop: 10 }}>
        <summary className="dim" style={{ cursor: "pointer" }}>View as a table</summary>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th className="num">Attended</th>
                <th className="num">Held</th>
                <th className="num">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.weekStart}>
                  <td>{prettyDate(p.weekStart)}</td>
                  <td className="num">{p.attended}</td>
                  <td className="num">{p.held}</td>
                  <td className="num">{p.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
