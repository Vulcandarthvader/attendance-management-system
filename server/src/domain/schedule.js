/**
 * Turning a timetable into a list of actual class dates.
 *
 * This is what replaces the hardcoded `min="2025-04-17" max="2025-04-30"` that
 * used to live in a JSX attribute. Because the semester and each course's
 * weekly slots are data, the system can *derive* how many classes a course has
 * in total, how many have already happened, and how many are still to come —
 * which is the whole basis of the attendance projection. Without it, "total
 * classes" is just a counter that increments whenever you remember to mark
 * something, and no forward-looking statement can be made at all.
 *
 * Pure functions only: no database, no Express, no clock except the `today`
 * you pass in. That makes every rule here testable in microseconds.
 */

import { addDays, eachDay, isoDay, todayUtc, toUtcDay, weekday, WEEKDAY_NAMES } from "./dates.js";

/**
 * All dates on which `course` meets during `semester`.
 *
 * @param {{startDate: Date|string, endDate: Date|string, holidays?: Array}} semester
 * @param {{weekdays: number[]}} course  weekdays as 0=Sun … 6=Sat
 * @returns {Date[]} ascending, midnight UTC
 */
export function classDates(semester, course) {
  const holidays = new Set((semester.holidays ?? []).map((h) => isoDay(h.date ?? h)));
  const meets = new Set(course.weekdays ?? []);
  if (meets.size === 0) return [];

  return eachDay(semester.startDate, semester.endDate).filter(
    (day) => meets.has(weekday(day)) && !holidays.has(isoDay(day)),
  );
}

/**
 * Split a course's class dates around a reference day.
 *
 * "Held" includes today: a class you had this morning counts. Everything after
 * today is "upcoming" — the pool the bunk planner is allowed to spend.
 */
export function splitSchedule(semester, course, today = todayUtc()) {
  const ref = toUtcDay(today);
  const all = classDates(semester, course);
  const held = all.filter((d) => d.getTime() <= ref.getTime());
  const upcoming = all.filter((d) => d.getTime() > ref.getTime());
  return { all, held, upcoming };
}

/**
 * Is `date` a legitimate class day for this course?
 *
 * The old backend answered this question nowhere — the weekend check lived in
 * an `onChange` handler in the browser, so a single `curl` could record
 * attendance for a Sunday in 2019. Every rule the UI enforces is enforced here
 * too, and the UI now asks this endpoint rather than duplicating the logic.
 *
 * @returns {{ok: boolean, reason?: string, code?: string}}
 */
export function validateClassDate(semester, course, date, today = todayUtc()) {
  let day;
  try {
    day = toUtcDay(date);
  } catch {
    return { ok: false, code: "invalid_date", reason: "That is not a valid date." };
  }

  const start = toUtcDay(semester.startDate);
  const end = toUtcDay(semester.endDate);
  const ref = toUtcDay(today);

  if (day < start || day > end) {
    return {
      ok: false,
      code: "outside_semester",
      reason: `${isoDay(day)} is outside the semester (${isoDay(start)} to ${isoDay(end)}).`,
    };
  }

  if (day > ref) {
    return {
      ok: false,
      code: "future",
      reason: "You cannot mark attendance for a class that has not happened yet.",
    };
  }

  const holiday = (semester.holidays ?? []).find((h) => isoDay(h.date ?? h) === isoDay(day));
  if (holiday) {
    return {
      ok: false,
      code: "holiday",
      reason: `${isoDay(day)} is a holiday${holiday.name ? ` (${holiday.name})` : ""}.`,
    };
  }

  if (!(course.weekdays ?? []).includes(weekday(day))) {
    const meets = (course.weekdays ?? []).map((d) => WEEKDAY_NAMES[d]).join(", ") || "no days";
    return {
      ok: false,
      code: "not_scheduled",
      reason: `${course.code ?? "This course"} does not meet on ${WEEKDAY_NAMES[weekday(day)]}s. It meets on ${meets}.`,
    };
  }

  return { ok: true };
}

/**
 * The next few class dates for a course that have no attendance recorded yet.
 * Drives the "you still owe these" prompt on the dashboard.
 */
export function unmarkedDates(semester, course, markedIsoDays, today = todayUtc(), limit = 10) {
  const marked = new Set(markedIsoDays);
  return splitSchedule(semester, course, today)
    .held.filter((d) => !marked.has(isoDay(d)))
    .slice(-limit);
}

/** Progress through the semester as a 0–1 fraction, for the header bar. */
export function semesterProgress(semester, today = todayUtc()) {
  const start = toUtcDay(semester.startDate).getTime();
  const end = toUtcDay(semester.endDate).getTime();
  const now = toUtcDay(today).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Convenience for seeding and tests: the first `n` class dates from a start day. */
export function nextClassDays(from, weekdays, n) {
  const out = [];
  let cursor = toUtcDay(from);
  const meets = new Set(weekdays);
  let guard = 0;
  while (out.length < n && guard++ < 3650) {
    if (meets.has(weekday(cursor))) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
