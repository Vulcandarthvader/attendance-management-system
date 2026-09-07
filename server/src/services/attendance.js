/**
 * Attendance service — where the timetable, the ledger and the maths meet.
 *
 * Controllers stay thin (parse, call, respond) and the domain stays pure, so
 * all the awkward reality lives here: what counts as held, what a cancelled
 * class does to the denominator, which dates you are allowed to mark.
 */

import { addDays, isoDay, startOfWeek, todayUtc, toUtcDay } from "../domain/dates.js";
import { classDates, semesterProgress, splitSchedule, validateClassDate } from "../domain/schedule.js";
import { aggregateBudget, computeBudget } from "../domain/bunk.js";

export function createAttendanceService(store) {
  const service = {
    async requireSemester(userId) {
      const semester = await store.semesters.getByUser(userId);
      if (!semester) {
        const err = new Error("Set up your semester dates before recording attendance.");
        err.status = 409;
        err.code = "no_semester";
        throw err;
      }
      return semester;
    },

    async requireCourse(userId, courseId) {
      const course = await store.courses.findById(userId, courseId);
      if (!course) {
        const err = new Error("That course does not exist.");
        err.status = 404;
        err.code = "course_not_found";
        throw err;
      }
      return course;
    },

    /**
     * Record one class. Idempotent by (course, day): marking the same slot twice
     * updates it rather than erroring, because "I picked absent, I meant
     * present" is a normal thing to do and a 409 is a hostile answer to it.
     *
     * v1 returned 409 on any repeat and offered no way to correct a mistake at
     * all — the only fix was editing the database by hand.
     */
    async mark(user, { courseId, date, status, note }, today = todayUtc()) {
      const semester = await service.requireSemester(user.id);
      const course = await service.requireCourse(user.id, courseId);

      const check = validateClassDate(semester, course, date, today);
      if (!check.ok) {
        const err = new Error(check.reason);
        err.status = 422;
        err.code = check.code;
        throw err;
      }

      const { record, created } = await store.attendance.upsert(user.id, { courseId, date, status, note });
      return { record: shapeRecord(record, course), created };
    },

    async markMany(user, entries, today = todayUtc()) {
      const results = [];
      for (const entry of entries) {
        try {
          const { record, created } = await service.mark(user, entry, today);
          results.push({ ok: true, date: entry.date, courseId: entry.courseId, created, record });
        } catch (err) {
          results.push({
            ok: false,
            date: entry.date,
            courseId: entry.courseId,
            code: err.code ?? "error",
            message: err.message,
          });
        }
      }
      return { results, saved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
    },

    async remove(user, recordId) {
      const removed = await store.attendance.remove(user.id, recordId);
      if (!removed) {
        const err = new Error("That attendance record does not exist.");
        err.status = 404;
        err.code = "record_not_found";
        throw err;
      }
      return { removed: true };
    },

    /**
     * Per-course standing plus the bunk budget.
     *
     * The denominator is the number of scheduled classes that have happened,
     * minus any marked cancelled. Not the number of records: a class you forgot
     * to mark still happened, and pretending otherwise flatters the percentage.
     * Unmarked past classes are surfaced separately so the gap is visible
     * instead of silently improving your numbers.
     */
    async overview(user, today = todayUtc()) {
      const semester = await store.semesters.getByUser(user.id);
      if (!semester) {
        return { semester: null, courses: [], overall: null, needsSetup: true };
      }
      const courses = await store.courses.listByUser(user.id);
      const counts = await store.attendance.countsByCourse(user.id);
      const records = await store.attendance.list(user.id);
      const threshold = semester.threshold ?? user.threshold ?? 0.75;

      const byCourse = new Map();
      for (const r of records) {
        const list = byCourse.get(String(r.courseId)) ?? [];
        list.push(r);
        byCourse.set(String(r.courseId), list);
      }

      const rows = courses.map((course) => {
        const { held: scheduledHeld, upcoming } = splitSchedule(semester, course, today);
        const c = counts.get(String(course.id)) ?? { present: 0, absent: 0, cancelled: 0 };
        const courseRecords = byCourse.get(String(course.id)) ?? [];
        const markedDays = new Set(courseRecords.map((r) => isoDay(r.date)));

        // A cancelled class leaves the denominator entirely.
        const held = Math.max(0, scheduledHeld.length - c.cancelled);
        const remaining = upcoming.length;
        const unmarked = scheduledHeld.filter((d) => !markedDays.has(isoDay(d)));

        const budget = computeBudget({ attended: c.present, held, remaining, threshold });

        return {
          course: shapeCourse(course),
          ...budget,
          cancelled: c.cancelled,
          unmarkedCount: unmarked.length,
          unmarkedDates: unmarked.slice(-14).map(isoDay),
          nextClass: upcoming[0] ? isoDay(upcoming[0]) : null,
        };
      });

      return {
        semester: shapeSemester(semester),
        progress: semesterProgress(semester, today),
        threshold,
        courses: rows,
        overall: rows.length ? aggregateBudget(rows, threshold) : null,
        needsSetup: courses.length === 0,
        today: isoDay(today),
      };
    },

    /** Cumulative attendance percentage week by week — the trend chart. */
    async trend(user, today = todayUtc()) {
      const semester = await store.semesters.getByUser(user.id);
      if (!semester) return { points: [], threshold: 0.75 };

      const courses = await store.courses.listByUser(user.id);
      const records = await store.attendance.list(user.id);
      const threshold = semester.threshold ?? 0.75;

      const cancelledDays = new Set(
        records.filter((r) => r.status === "cancelled").map((r) => `${r.courseId}|${isoDay(r.date)}`),
      );
      const presentDays = new Set(
        records.filter((r) => r.status === "present").map((r) => `${r.courseId}|${isoDay(r.date)}`),
      );

      // Every scheduled class up to today, flattened and sorted.
      const slots = [];
      for (const course of courses) {
        for (const d of classDates(semester, course)) {
          if (d.getTime() > toUtcDay(today).getTime()) continue;
          const key = `${course.id}|${isoDay(d)}`;
          if (cancelledDays.has(key)) continue;
          slots.push({ date: d, present: presentDays.has(key) });
        }
      }
      slots.sort((a, b) => a.date - b.date);

      const points = [];
      let held = 0;
      let attended = 0;
      let cursor = startOfWeek(semester.startDate);
      const end = toUtcDay(today);

      let i = 0;
      while (cursor.getTime() <= end.getTime() + 6 * 86_400_000) {
        const weekEnd = addDays(cursor, 6);
        while (i < slots.length && slots[i].date.getTime() <= weekEnd.getTime()) {
          held += 1;
          if (slots[i].present) attended += 1;
          i += 1;
        }
        if (held > 0) {
          points.push({
            weekStart: isoDay(cursor),
            weekEnd: isoDay(weekEnd),
            held,
            attended,
            pct: (attended / held) * 100,
          });
        }
        cursor = addDays(cursor, 7);
      }

      return { points, threshold, thresholdPct: threshold * 100 };
    },

    /** Day-by-day records for the calendar heatmap. */
    async calendar(user, { from, to } = {}) {
      const semester = await store.semesters.getByUser(user.id);
      if (!semester) return { days: [] };

      const courses = await store.courses.listByUser(user.id);
      const courseById = new Map(courses.map((c) => [String(c.id), c]));
      const records = await store.attendance.list(user.id, {
        from: from ?? semester.startDate,
        to: to ?? semester.endDate,
      });

      const days = new Map();
      for (const r of records) {
        const key = isoDay(r.date);
        const entry = days.get(key) ?? { date: key, present: 0, absent: 0, cancelled: 0, items: [] };
        entry[r.status] += 1;
        entry.items.push({
          id: r.id,
          courseId: String(r.courseId),
          code: courseById.get(String(r.courseId))?.code ?? "?",
          status: r.status,
          note: r.note ?? "",
        });
        days.set(key, entry);
      }
      return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
    },

    /**
     * Which classes on a given day still need marking. Drives the
     * one-tap "mark today" flow, and is the reason the client no longer
     * needs its own copy of the weekend and semester rules.
     */
    async agenda(user, date, today = todayUtc()) {
      const semester = await store.semesters.getByUser(user.id);
      if (!semester) return { date: isoDay(date), items: [] };
      const courses = await store.courses.listByUser(user.id);
      const day = toUtcDay(date);
      const records = await store.attendance.list(user.id, { from: day, to: day });
      const marked = new Map(records.map((r) => [String(r.courseId), r]));

      const items = [];
      for (const course of courses) {
        const check = validateClassDate(semester, course, day, today);
        if (!check.ok) continue;
        const existing = marked.get(String(course.id));
        items.push({
          course: shapeCourse(course),
          status: existing?.status ?? null,
          recordId: existing?.id ?? null,
          note: existing?.note ?? "",
        });
      }
      return { date: isoDay(day), items };
    },
  };

  return service;
}

function shapeCourse(c) {
  return { id: String(c.id), code: c.code, name: c.name, weekdays: c.weekdays, color: c.color ?? null };
}

function shapeSemester(s) {
  return {
    id: String(s.id),
    name: s.name,
    startDate: isoDay(s.startDate),
    endDate: isoDay(s.endDate),
    threshold: s.threshold,
    holidays: (s.holidays ?? []).map((h) => ({ date: isoDay(h.date), name: h.name ?? "" })),
  };
}

function shapeRecord(r, course) {
  return {
    id: String(r.id),
    courseId: String(r.courseId),
    courseCode: course?.code ?? null,
    date: isoDay(r.date),
    status: r.status,
    note: r.note ?? "",
  };
}

export { shapeCourse, shapeSemester, shapeRecord };
