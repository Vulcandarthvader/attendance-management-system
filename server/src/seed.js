/**
 * Demo data.
 *
 * Dates are generated *relative to today* rather than hardcoded, so the demo is
 * never stale: the semester is always partly done, there are always classes
 * still to come, and the bunk planner always has something meaningful to say.
 * v1's seed created five students with empty attendance and a form defaulting
 * to a fixed date in the past, so a first run showed nothing at all.
 *
 * The generated history is deliberately uneven — one course comfortable, one on
 * the line, one below it — because a dashboard where everything is green
 * demonstrates none of the logic that makes the dashboard worth having.
 */

import bcrypt from "bcryptjs";
import { addDays, isoDay, startOfWeek, todayUtc } from "./domain/dates.js";
import { classDates } from "./domain/schedule.js";

/** Deterministic PRNG so the demo looks identical on every machine. */
function mulberry32(seed) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COURSES = [
  { code: "DBMS", name: "Database Management Systems", weekdays: [1, 3, 5], rate: 0.93 },
  { code: "MPMC", name: "Microprocessors & Microcontrollers", weekdays: [2, 4], rate: 0.80 },
  { code: "TOC", name: "Theory of Computation", weekdays: [1, 4], rate: 0.74 },
  { code: "COA", name: "Computer Organisation & Architecture", weekdays: [2, 5], rate: 0.83 },
  { code: "SE", name: "Software Engineering", weekdays: [3], rate: 0.62 },
];

export async function seedDemo(store, { username, password, force = false } = {}) {
  const existing = await store.users.findByUsername(username);
  if (existing && !force) return { seeded: false, username };

  const user =
    existing ??
    (await store.users.create({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: "Demo Student",
      rollNumber: "19",
      threshold: 0.75,
    }));

  const today = todayUtc();
  // 13 weeks elapsed, 5 still to run — far enough in for the numbers to mean
  // something, with enough left that recovery is still possible.
  const start = startOfWeek(addDays(today, -13 * 7));
  const end = addDays(start, 18 * 7 - 3);

  const semester = await store.semesters.upsert(user.id, {
    name: "Semester 6",
    startDate: start,
    endDate: end,
    threshold: 0.75,
    holidays: [
      { date: isoDay(addDays(start, 24)), name: "Mid-semester break" },
      { date: isoDay(addDays(start, 25)), name: "Mid-semester break" },
      { date: isoDay(addDays(start, 59)), name: "Public holiday" },
    ],
  });

  const rand = mulberry32(20260904);
  let created = 0;

  for (const spec of COURSES) {
    const existingCourse = await store.courses.findByCode(user.id, spec.code);
    const course =
      existingCourse ??
      (await store.courses.create(user.id, {
        code: spec.code,
        name: spec.name,
        weekdays: spec.weekdays,
      }));

    const held = classDates(semester, course).filter((d) => d.getTime() <= today.getTime());

    // Leave the two most recent classes of one course unmarked, so the
    // "you have classes still to log" nudge has something to point at.
    const skipTail = spec.code === "MPMC" ? 2 : 0;
    const markable = skipTail ? held.slice(0, -skipTail) : held;

    for (const date of markable) {
      const roll = rand();
      let status;
      if (roll < 0.035) status = "cancelled";
      else status = rand() < spec.rate ? "present" : "absent";
      await store.attendance.upsert(user.id, { courseId: course.id, date, status, note: "" });
      created += 1;
    }
  }

  return { seeded: true, username, records: created, semester: semester.name };
}

export async function seedIfEmpty(store, config, logger = console) {
  if (config.seedDemo === "false") return { seeded: false };
  const users = await store.users.count();
  if (users > 0 && config.seedDemo !== "true") return { seeded: false };

  const result = await seedDemo(store, {
    username: config.demoUsername,
    password: config.demoPassword,
    force: config.seedDemo === "true",
  });

  if (result.seeded) {
    logger.info?.(
      `[seed] demo account ready — sign in with "${result.username}" / "${config.demoPassword}" ` +
        `(${result.records} attendance records across ${COURSES.length} courses)`,
    );
  }
  return result;
}
