import { Suspense, lazy } from "react";
import { Link, useNavigate } from "react-router-dom";

import Banner from "../components/Banner.jsx";
import CourseCard from "../components/CourseCard.jsx";
import Ring from "../components/Ring.jsx";

// The charting library is over half the bundle and only one screen needs it,
// so it loads on demand rather than blocking first paint.
const TrendChart = lazy(() => import("../components/TrendChart.jsx"));
import { api } from "../lib/api.js";
import { useAsync } from "../lib/useAsync.js";
import { STATUS_LABEL, pct, prettyRange } from "../lib/format.js";

export default function Dashboard() {
  const navigate = useNavigate();
  const overview = useAsync(() => api.overview(), []);
  const trend = useAsync(() => api.trend(), []);

  if (overview.loading) return <LoadingSkeleton />;
  if (overview.error) return <Banner kind="error">{overview.error.message}</Banner>;

  const data = overview.data;

  if (!data.semester) {
    return (
      <EmptyState
        title="Set up your semester"
        body="Add your semester dates and the days each subject meets. Everything else — totals, projections, how many classes you can miss — is derived from that."
        action={() => navigate("/settings")}
        label="Go to settings"
      />
    );
  }
  if (!data.courses.length) {
    return (
      <EmptyState
        title="Add your first course"
        body="Tell the app which days each subject meets and it can work out how many classes exist, how many are left, and what you can afford to miss."
        action={() => navigate("/settings")}
        label="Add a course"
      />
    );
  }

  const overall = data.overall;
  const thresholdPct = Math.round(data.threshold * 100);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{data.semester.name}</h1>
          <p className="muted">
            {prettyRange(data.semester.startDate, data.semester.endDate)} · {Math.round(data.progress * 100)}% elapsed
          </p>
        </div>
        <Link to="/mark"><button className="primary">Mark today</button></Link>
      </div>

      <div className="progress" style={{ marginBottom: 22 }}>
        <span style={{ width: `${data.progress * 100}%` }} />
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 22, alignItems: "center" }}>
          <Ring value={overall.currentPct} threshold={thresholdPct} status={overall.status} size={128} stroke={11} />
          <div style={{ flex: 1, minWidth: 230 }}>
            <span className="stat-label">Across all subjects</span>
            <p style={{ fontSize: "1.05rem", fontWeight: 550, margin: "4px 0 8px" }}>{overall.message}</p>
            <div className="row" style={{ gap: 22 }}>
              <Figure label="Attended" value={`${overall.attended} / ${overall.held}`} />
              <Figure label="Still to come" value={overall.remaining} />
              <Figure label="Best possible" value={pct(overall.bestCasePct, 0)} />
              <Figure label="Subjects at risk" value={`${overall.atRiskCount} of ${overall.courseCount}`} />
            </div>
          </div>
        </div>

        {overall.atRiskCount > 0 && overall.worstCourse && (
          <p className="muted" style={{ marginTop: 16 }}>
            Attendance rules apply per subject, so a healthy average does not rescue a weak one.{" "}
            <strong>{overall.worstCourse.course.code}</strong> is the one to watch at{" "}
            {pct(overall.worstCourse.currentPct)}.
          </p>
        )}
      </section>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div>
            <h2>Trend</h2>
            <p className="dim">Cumulative attendance across all subjects, week by week.</p>
          </div>
        </div>
        {trend.loading ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : (
          <Suspense fallback={<div className="skeleton" style={{ height: 200 }} />}>
            <TrendChart
              points={trend.data?.points ?? []}
              thresholdPct={trend.data?.thresholdPct ?? thresholdPct}
            />
          </Suspense>
        )}
      </section>

      <h2 style={{ margin: "26px 0 14px" }}>By subject</h2>
      <div className="grid grid-2">
        {data.courses.map((row) => (
          <CourseCard key={row.course.id} row={row} onOpen={(c) => navigate(`/history?course=${c.id}`)} />
        ))}
      </div>
    </>
  );
}

function Figure({ label, value }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function EmptyState({ title, body, action, label }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 44 }}>
      <h2>{title}</h2>
      <p className="muted" style={{ margin: "10px auto 20px", maxWidth: 460 }}>{body}</p>
      <button className="primary" onClick={action}>{label}</button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="stack">
      <div className="skeleton" style={{ height: 34, width: 220 }} />
      <div className="skeleton" style={{ height: 170 }} />
      <div className="grid grid-2">
        <div className="skeleton" style={{ height: 240 }} />
        <div className="skeleton" style={{ height: 240 }} />
      </div>
    </div>
  );
}
