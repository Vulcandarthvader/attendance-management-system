/**
 * Date helpers.
 *
 * Every date in this system is a *calendar day*, never an instant. A class on
 * the 14th is on the 14th whether you are in Goa or Toronto. All dates are
 * therefore normalised to midnight UTC before they are stored or compared.
 *
 * The original version stored `new Date(dateString)` directly and looked up
 * duplicates with an exact-timestamp match. That worked only as long as every
 * client sent a bare `YYYY-MM-DD`; a payload carrying any time component, or a
 * `Date` serialised from a browser in a positive-offset timezone, produced a
 * different instant for the same day and slipped straight past the unique
 * index.
 */

export const MS_PER_DAY = 86_400_000;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalise anything date-like to midnight UTC on that calendar day.
 * A bare `YYYY-MM-DD` is taken at face value; a full timestamp is truncated.
 */
export function toUtcDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("Invalid Date");
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === "string") {
    if (ISO_DAY.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      const out = new Date(Date.UTC(y, m - 1, d));
      if (Number.isNaN(out.getTime())) throw new TypeError(`Invalid date: ${value}`);
      return out;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new TypeError(`Invalid date: ${value}`);
    return toUtcDay(parsed);
  }
  if (typeof value === "number") return toUtcDay(new Date(value));
  throw new TypeError(`Cannot interpret ${JSON.stringify(value)} as a date`);
}

/** Format as `YYYY-MM-DD`. The only shape that crosses the API boundary. */
export function isoDay(value) {
  return toUtcDay(value).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, in UTC. */
export function weekday(value) {
  return toUtcDay(value).getUTCDay();
}

export function isWeekend(value) {
  const d = weekday(value);
  return d === 0 || d === 6;
}

export function addDays(value, n) {
  return new Date(toUtcDay(value).getTime() + n * MS_PER_DAY);
}

export function sameDay(a, b) {
  return toUtcDay(a).getTime() === toUtcDay(b).getTime();
}

export function daysBetween(a, b) {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / MS_PER_DAY);
}

/** Every calendar day from `start` to `end`, inclusive. */
export function eachDay(start, end) {
  const out = [];
  const last = toUtcDay(end).getTime();
  for (let t = toUtcDay(start); t.getTime() <= last; t = addDays(t, 1)) out.push(t);
  return out;
}

/** Monday of the ISO week containing `value`. */
export function startOfWeek(value) {
  const d = toUtcDay(value);
  const shift = (d.getUTCDay() + 6) % 7; // Monday-based
  return addDays(d, -shift);
}

export function todayUtc() {
  return toUtcDay(new Date());
}
