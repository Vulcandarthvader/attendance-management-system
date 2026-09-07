/**
 * The bunk budget: how many more classes can I miss and still clear the bar?
 *
 * This is the question a student actually has. A percentage tells you where you
 * stand; it does not tell you what you can afford, because the answer depends
 * on how much semester is left. 78% in week two and 78% in week fourteen are
 * completely different situations, and only one of them is a problem.
 *
 * Notation used throughout:
 *   a = classes attended so far
 *   h = classes held so far (the denominator; cancelled classes are excluded)
 *   r = classes remaining in the semester
 *   T = h + r, the final denominator
 *   p = required threshold as a fraction (0.75 for 75%)
 *
 * Two questions, two closed forms, both derived below rather than iterated —
 * the UI recomputes these on every keystroke of the threshold slider.
 */

/**
 * Largest number of remaining classes you can skip and still finish at or above
 * the threshold.
 *
 *   (a + r − k) / T ≥ p
 *   ⇒ k ≤ a + r − pT
 *
 * A negative result means the target is already out of reach: even attending
 * every remaining class leaves you short.
 */
export function maxSkippable(attended, remaining, total, threshold) {
  if (total <= 0) return { value: 0, reachable: true };
  const slack = attended + remaining - threshold * total;
  // Counts are integers, so floor is exact; the epsilon absorbs the float error
  // in p·T, which otherwise turns a legitimate 3.0000000000000004 into a 3 and,
  // worse, a legitimate 3.0 into a 2.
  const value = Math.floor(slack + 1e-9);
  return { value: Math.max(0, Math.min(value, remaining)), reachable: value >= 0 };
}

/**
 * Fewest classes you must attend *consecutively, starting now* to climb back to
 * the threshold.
 *
 *   (a + m) / (h + m) ≥ p
 *   ⇒ m(1 − p) ≥ ph − a
 *   ⇒ m ≥ (ph − a) / (1 − p)
 *
 * Each class you attend lifts both numerator and denominator, which is why
 * recovery gets harder the further you fall: the denominator grows too. At
 * p = 1 the expression has no solution unless you have already attended
 * everything — a 100% requirement is unrecoverable by definition.
 */
export function classesToRecover(attended, held, threshold) {
  if (held <= 0) return 0;
  if (attended >= threshold * held - 1e-9) return 0;
  if (threshold >= 1) return Infinity;
  return Math.max(0, Math.ceil((threshold * held - attended) / (1 - threshold) - 1e-9));
}

/**
 * Full picture for one course.
 *
 * @param {object} input
 * @param {number} input.attended   classes attended so far
 * @param {number} input.held       classes held so far (excludes cancelled)
 * @param {number} input.remaining  scheduled classes still to come
 * @param {number} input.threshold  required fraction, e.g. 0.75
 */
export function computeBudget({ attended = 0, held = 0, remaining = 0, threshold = 0.75 }) {
  const total = held + remaining;
  const currentPct = held > 0 ? (attended / held) * 100 : null;

  const skip = maxSkippable(attended, remaining, total, threshold);
  const needed = classesToRecover(attended, held, threshold);

  const bestCase = total > 0 ? ((attended + remaining) / total) * 100 : null;
  const worstCase = total > 0 ? (attended / total) * 100 : null;

  const meetsNow = currentPct === null || currentPct >= threshold * 100 - 1e-9;

  // Order matters. "Tight" means "you meet the bar but have no margin left to
  // spend"; it is only meaningful while there are classes still to spend. Once
  // the semester's classes are done the number is final, and a course sitting
  // at 90% with nothing left to attend is finished, not precarious.
  let status;
  if (remaining === 0) status = meetsNow ? "safe" : "unrecoverable";
  else if (!skip.reachable) status = "unrecoverable";
  else if (!meetsNow) status = needed <= remaining ? "recovering" : "unrecoverable";
  else if (skip.value === 0) status = "tight";
  else status = "safe";

  return {
    attended,
    held,
    remaining,
    total,
    absent: Math.max(0, held - attended),
    threshold,
    currentPct,
    bestCasePct: bestCase,
    worstCasePct: worstCase,
    /** Classes you may still miss. The headline number. */
    canSkip: skip.value,
    /** Classes you must attend in a row to get back to the line. */
    mustAttend: meetsNow ? 0 : needed,
    reachable: skip.reachable && (meetsNow || needed <= remaining),
    status,
    message: describe({ status, canSkip: skip.value, mustAttend: needed, remaining, currentPct, threshold }),
  };
}

function describe({ status, canSkip, mustAttend, remaining, currentPct, threshold }) {
  const pct = currentPct === null ? "no classes yet" : `${currentPct.toFixed(1)}%`;
  const bar = `${(threshold * 100).toFixed(0)}%`;

  if (remaining === 0) {
    return status === "safe"
      ? `Finished at ${pct}, clear of the ${bar} requirement.`
      : `Finished at ${pct}, below the ${bar} requirement. No classes remain.`;
  }

  switch (status) {
    case "safe":
      return `At ${pct}. You can miss ${canSkip} more ${plural(canSkip, "class", "classes")} and still finish at ${bar}.`;
    case "tight":
      return `At ${pct}, but with no room left — miss one more and you drop below ${bar}.`;
    case "recovering":
      return `At ${pct}, below ${bar}. Attend the next ${mustAttend} ${plural(mustAttend, "class", "classes")} in a row to get back.`;
    case "unrecoverable":
      return `At ${pct}. Even attending all ${remaining} remaining ${plural(remaining, "class", "classes")} finishes below ${bar}.`;
    default:
      return "";
  }
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * Roll per-course budgets into one overall position.
 *
 * Deliberately *not* an average of percentages: a course with 40 classes and a
 * course with 8 do not carry equal weight, and averaging their percentages
 * would quietly claim they do. The aggregate is computed from the pooled
 * counts, and the per-course figures are what you actually act on — attendance
 * rules are enforced per course, so one healthy course cannot rescue another.
 */
export function aggregateBudget(budgets, threshold = 0.75) {
  const attended = sum(budgets, "attended");
  const held = sum(budgets, "held");
  const remaining = sum(budgets, "remaining");
  const overall = computeBudget({ attended, held, remaining, threshold });

  const atRisk = budgets.filter((b) => b.status !== "safe");

  // The pooled allowance is real arithmetic and a dangerous headline: you are
  // marked per subject, so "16 classes to spare" is worthless while three
  // subjects are already under the bar. When anything is at risk the summary
  // says so instead of quoting a number nobody can safely act on.
  const message = atRisk.length
    ? `${overall.currentPct === null ? "No classes yet" : `${overall.currentPct.toFixed(1)}% overall`}, but ` +
      `${atRisk.length} of ${budgets.length} ${atRisk.length === 1 ? "subject is" : "subjects are"} ` +
      `below target. Attendance is judged per subject, so the pooled figure is not what you are marked on.`
    : overall.message;

  return {
    ...overall,
    message,
    courseCount: budgets.length,
    atRiskCount: atRisk.length,
    worstCourse: budgets.reduce(
      (worst, b) => (worst === null || (b.currentPct ?? 101) < (worst.currentPct ?? 101) ? b : worst),
      null,
    ),
  };
}

function sum(rows, key) {
  return rows.reduce((t, r) => t + (r[key] ?? 0), 0);
}
