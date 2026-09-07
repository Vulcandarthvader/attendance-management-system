/** Small formatting helpers shared by the views. */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

/** Today as YYYY-MM-DD in the *viewer's* timezone, which is the day they mean. */
export function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function pct(value, digits = 1) {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : `${value.toFixed(digits)}%`;
}

export function prettyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function prettyRange(startIso, endIso) {
  return `${prettyDate(startIso)} – ${prettyDate(endIso)}`;
}

export function weekdayList(days) {
  if (!days?.length) return "no days set";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}

/** Status colour tokens. Reserved for state, never reused for a course. */
export const STATUS_TOKEN = {
  safe: "var(--good)",
  tight: "var(--warning)",
  recovering: "var(--serious)",
  unrecoverable: "var(--critical)",
};

export const STATUS_LABEL = {
  safe: "On track",
  tight: "No margin",
  recovering: "Below target",
  unrecoverable: "Out of reach",
};

/**
 * Courses are identified by their code in text, never by colour.
 *
 * Five courses would mean cycling a three-hue palette, and two subjects sharing
 * a colour is worse than no colour at all. Each course card is a single-value
 * chart anyway, so the one colour it needs is the one that carries meaning:
 * whether you are above the line. Colour is spent on state, and identity is
 * spent on the heading.
 */
export function statusColor(status) {
  return STATUS_TOKEN[status] ?? "var(--text-3)";
}
