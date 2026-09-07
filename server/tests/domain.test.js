/**
 * Domain tests — the maths, with no database and no HTTP in sight.
 *
 * These run in milliseconds because the functions under test are pure. That is
 * the payoff for keeping the interesting logic out of the controllers: the
 * rules that decide whether you pass the semester get tested exhaustively,
 * instead of incidentally through an API call.
 */

import { describe, expect, it } from "vitest";

import { addDays, isoDay, isWeekend, startOfWeek, toUtcDay, weekday } from "../src/domain/dates.js";
import { classDates, splitSchedule, validateClassDate } from "../src/domain/schedule.js";
import { aggregateBudget, classesToRecover, computeBudget, maxSkippable } from "../src/domain/bunk.js";

const semester = {
  startDate: "2026-01-05", // a Monday
  endDate: "2026-03-27", // a Friday
  holidays: [{ date: "2026-01-26", name: "Republic Day" }],
  threshold: 0.75,
};
const dbms = { code: "DBMS", weekdays: [1, 3, 5] }; // Mon/Wed/Fri

describe("dates", () => {
  it("normalises any date-like input to midnight UTC on the same calendar day", () => {
    const expected = Date.UTC(2026, 2, 14);
    expect(toUtcDay("2026-03-14").getTime()).toBe(expected);
    expect(toUtcDay("2026-03-14T18:45:00Z").getTime()).toBe(expected);
    expect(toUtcDay(new Date("2026-03-14T23:59:59Z")).getTime()).toBe(expected);
  });

  it("treats a bare YYYY-MM-DD as that day, not as a local-time instant", () => {
    // The v1 duplicate check compared exact timestamps, so a payload with a
    // time component created a second record for a day already marked.
    expect(isoDay("2026-03-14")).toBe("2026-03-14");
    expect(isoDay("2026-03-14T19:30:00Z")).toBe("2026-03-14");
  });

  it("rejects nonsense instead of silently producing an Invalid Date", () => {
    expect(() => toUtcDay("not-a-date")).toThrow();
    expect(() => toUtcDay(null)).toThrow();
  });

  it("knows weekdays and weekends", () => {
    expect(weekday("2026-01-05")).toBe(1); // Monday
    expect(isWeekend("2026-01-10")).toBe(true); // Saturday
    expect(isWeekend("2026-01-11")).toBe(true); // Sunday
    expect(isWeekend("2026-01-09")).toBe(false);
  });

  it("starts weeks on Monday", () => {
    expect(isoDay(startOfWeek("2026-01-11"))).toBe("2026-01-05"); // Sunday -> prior Monday
    expect(isoDay(startOfWeek("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("schedule", () => {
  it("derives class dates from the timetable rather than a hardcoded window", () => {
    const dates = classDates(semester, dbms);
    expect(dates.every((d) => dbms.weekdays.includes(weekday(d)))).toBe(true);
    expect(isoDay(dates[0])).toBe("2026-01-05");
    expect(dates.length).toBeGreaterThan(30);
  });

  it("removes holidays from the count", () => {
    const withHoliday = classDates(semester, dbms);
    const withoutHoliday = classDates({ ...semester, holidays: [] }, dbms);
    // 2026-01-26 is a Monday, so DBMS would otherwise meet.
    expect(withoutHoliday.length - withHoliday.length).toBe(1);
    expect(withHoliday.map(isoDay)).not.toContain("2026-01-26");
  });

  it("counts today as held and everything after it as upcoming", () => {
    const { held, upcoming, all } = splitSchedule(semester, dbms, "2026-02-04"); // a Wednesday
    expect(isoDay(held.at(-1))).toBe("2026-02-04");
    expect(held.length + upcoming.length).toBe(all.length);
  });

  describe("validateClassDate", () => {
    const today = "2026-02-20";

    it("accepts a scheduled weekday inside the semester", () => {
      expect(validateClassDate(semester, dbms, "2026-02-04", today).ok).toBe(true);
    });

    it("rejects a day the course does not meet", () => {
      const res = validateClassDate(semester, dbms, "2026-02-03", today); // Tuesday
      expect(res.ok).toBe(false);
      expect(res.code).toBe("not_scheduled");
    });

    it("rejects weekends, because no course meets on one", () => {
      expect(validateClassDate(semester, dbms, "2026-02-07", today).code).toBe("not_scheduled");
    });

    it("rejects dates outside the semester", () => {
      expect(validateClassDate(semester, dbms, "2025-12-01", today).code).toBe("outside_semester");
      expect(validateClassDate(semester, dbms, "2026-06-01", today).code).toBe("outside_semester");
    });

    it("rejects the future — you cannot have attended tomorrow", () => {
      expect(validateClassDate(semester, dbms, "2026-02-25", today).code).toBe("future");
    });

    it("rejects holidays", () => {
      expect(validateClassDate(semester, dbms, "2026-01-26", today).code).toBe("holiday");
    });

    it("explains itself in words a person can act on", () => {
      const res = validateClassDate(semester, dbms, "2026-02-03", today);
      expect(res.reason).toMatch(/does not meet on Tuesdays/);
    });
  });
});

describe("bunk budget", () => {
  it("computes how many classes can still be skipped", () => {
    // 30 attended of 34 held, 16 to come: total 50, need 37.5 -> 38.
    // Attending everything gives 46, so 8 can go.
    const b = computeBudget({ attended: 30, held: 34, remaining: 16, threshold: 0.75 });
    expect(b.canSkip).toBe(8);
    expect(b.status).toBe("safe");
    expect(b.currentPct).toBeCloseTo(88.24, 1);
  });

  it("is exact at the boundary rather than off by one", () => {
    // 30 of 40 is exactly 75% today, but three classes are still to come, so
    // the final denominator is 43 and 32.25 -> 33 attendances are needed.
    // Nothing may be skipped even though the target is currently met.
    const exact = computeBudget({ attended: 30, held: 40, remaining: 3, threshold: 0.75 });
    expect(exact.canSkip).toBe(0);
    expect(exact.status).toBe("tight");
    expect(exact.reachable).toBe(true);

    const oneMore = computeBudget({ attended: 30, held: 39, remaining: 1, threshold: 0.75 });
    expect(oneMore.canSkip).toBe(1); // 30/40 = 75% even if the last is skipped
  });

  it("never promises more skips than there are classes left", () => {
    const b = computeBudget({ attended: 40, held: 40, remaining: 2, threshold: 0.5 });
    expect(b.canSkip).toBe(2);
  });

  it("says how many classes in a row are needed to recover", () => {
    // 20 of 40 is 50%. Each attended class lifts both sides of the fraction,
    // so reaching 75% needs (0.75*40 - 20) / 0.25 = 40 classes.
    expect(classesToRecover(20, 40, 0.75)).toBe(40);
    expect(classesToRecover(30, 40, 0.75)).toBe(0); // already at the line
  });

  it("marks a target unreachable when even perfect attendance falls short", () => {
    const b = computeBudget({ attended: 5, held: 30, remaining: 4, threshold: 0.75 });
    expect(b.reachable).toBe(false);
    expect(b.status).toBe("unrecoverable");
    expect(b.message).toMatch(/Even attending all 4/);
  });

  it("distinguishes recovering from unrecoverable by what is left", () => {
    const recovering = computeBudget({ attended: 14, held: 20, remaining: 30, threshold: 0.75 });
    expect(recovering.status).toBe("recovering");
    expect(recovering.mustAttend).toBeGreaterThan(0);
    expect(recovering.mustAttend).toBeLessThanOrEqual(recovering.remaining);
  });

  it("treats a 100% requirement as unrecoverable once anything is missed", () => {
    expect(classesToRecover(9, 10, 1)).toBe(Infinity);
    expect(classesToRecover(10, 10, 1)).toBe(0);
  });

  it("handles a semester that has not started", () => {
    const b = computeBudget({ attended: 0, held: 0, remaining: 40, threshold: 0.75 });
    expect(b.currentPct).toBeNull();
    expect(b.canSkip).toBe(10); // 30 of 40 needed
    expect(b.status).toBe("safe");
  });

  it("calls a finished course safe rather than tight when it cleared the bar", () => {
    // With nothing left to attend, "no margin" is not a meaningful warning.
    const done = computeBudget({ attended: 36, held: 40, remaining: 0, threshold: 0.75 });
    expect(done.status).toBe("safe");
    expect(done.message).toMatch(/Finished at 90.0%/);

    const failed = computeBudget({ attended: 20, held: 40, remaining: 0, threshold: 0.75 });
    expect(failed.status).toBe("unrecoverable");
  });

  it("aggregates by pooled counts, not by averaging percentages", () => {
    const big = computeBudget({ attended: 36, held: 40, remaining: 0, threshold: 0.75 }); // 90%
    const small = computeBudget({ attended: 2, held: 4, remaining: 0, threshold: 0.75 }); // 50%
    const overall = aggregateBudget([big, small], 0.75);
    // Mean of percentages would be 70%; the true pooled figure is 38/44.
    expect(overall.currentPct).toBeCloseTo((38 / 44) * 100, 6);
    expect(overall.atRiskCount).toBe(1);
    // The headline must not quote a pooled skip allowance while a subject is
    // failing — that is the number people misread.
    expect(overall.message).toMatch(/1 of 2 subject is below target/);
    expect(overall.message).not.toMatch(/You can miss/);
    expect(overall.worstCourse.currentPct).toBeCloseTo(50, 6);
  });
});

describe("maxSkippable", () => {
  it("returns unreachable rather than a negative allowance", () => {
    const res = maxSkippable(2, 3, 20, 0.75);
    expect(res.reachable).toBe(false);
    expect(res.value).toBe(0);
  });

  it("copes with an empty semester", () => {
    expect(maxSkippable(0, 0, 0, 0.75)).toEqual({ value: 0, reachable: true });
  });
});
