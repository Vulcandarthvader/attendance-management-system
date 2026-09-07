/**
 * Store contract.
 *
 * One suite, run against every adapter. This is what stops the in-memory store
 * from being a mock that happily agrees with itself: the same assertions must
 * hold for Mongoose talking to a real MongoDB, and any behaviour that drifts
 * between them fails here rather than in production.
 *
 * The memory adapter runs everywhere. The Mongo adapter runs when TEST_MONGO_URI
 * points at a database, and is skipped with a clear message otherwise, so the
 * suite never silently pretends to have tested something it did not.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { isoDay } from "../../src/domain/dates.js";

export function runStoreContract(label, getStore) {
  describe(`store contract: ${label}`, () => {
    let store;
    let userId;

    beforeEach(async () => {
      store = getStore();
      await store.reset();
      const user = await store.users.create({ username: "contract", passwordHash: "hash" });
      userId = user.id;
    });

    describe("users", () => {
      it("round-trips a user and finds them case-insensitively", async () => {
        const found = await store.users.findByUsername("CONTRACT");
        expect(found.id).toBe(userId);
        expect(found.username).toBe("contract");
      });

      it("returns null rather than throwing for an unknown user", async () => {
        expect(await store.users.findByUsername("nobody")).toBeNull();
      });

      it("applies defaults", async () => {
        const user = await store.users.findById(userId);
        expect(user.threshold).toBe(0.75);
      });
    });

    describe("semesters", () => {
      it("stores one semester per user and overwrites on repeat save", async () => {
        await store.semesters.upsert(userId, {
          name: "Sem 5",
          startDate: "2026-01-05",
          endDate: "2026-04-30",
        });
        await store.semesters.upsert(userId, {
          name: "Sem 6",
          startDate: "2026-01-05",
          endDate: "2026-05-30",
          holidays: [{ date: "2026-01-26", name: "Republic Day" }],
        });

        const sem = await store.semesters.getByUser(userId);
        expect(sem.name).toBe("Sem 6");
        expect(isoDay(sem.endDate)).toBe("2026-05-30");
        expect(sem.holidays).toHaveLength(1);
        expect(isoDay(sem.holidays[0].date)).toBe("2026-01-26");
      });

      it("normalises stored dates to midnight UTC", async () => {
        await store.semesters.upsert(userId, {
          name: "S",
          startDate: "2026-01-05",
          endDate: "2026-04-30",
        });
        const sem = await store.semesters.getByUser(userId);
        expect(new Date(sem.startDate).getUTCHours()).toBe(0);
        expect(isoDay(sem.startDate)).toBe("2026-01-05");
      });
    });

    describe("courses", () => {
      it("creates, lists, updates and deletes", async () => {
        const created = await store.courses.create(userId, {
          code: "DBMS",
          name: "Databases",
          weekdays: [3, 1, 5],
        });
        expect(created.weekdays).toEqual([1, 3, 5]); // stored sorted and unique

        const list = await store.courses.listByUser(userId);
        expect(list).toHaveLength(1);

        const updated = await store.courses.update(userId, created.id, { name: "Database Systems" });
        expect(updated.name).toBe("Database Systems");

        expect(await store.courses.remove(userId, created.id)).toBe(true);
        expect(await store.courses.listByUser(userId)).toHaveLength(0);
      });

      it("finds by code and scopes every lookup to the owner", async () => {
        const other = await store.users.create({ username: "other", passwordHash: "h" });
        const mine = await store.courses.create(userId, { code: "TOC", name: "Theory", weekdays: [1] });

        expect((await store.courses.findByCode(userId, "toc")).id).toBe(mine.id);
        expect(await store.courses.findByCode(other.id, "TOC")).toBeNull();
        expect(await store.courses.findById(other.id, mine.id)).toBeNull();
        expect(await store.courses.remove(other.id, mine.id)).toBe(false);
      });

      it("returns null for a malformed id instead of throwing", async () => {
        expect(await store.courses.findById(userId, "not-an-id")).toBeNull();
      });

      it("deletes a course's attendance along with it", async () => {
        const course = await store.courses.create(userId, { code: "SE", name: "SE", weekdays: [3] });
        await store.attendance.upsert(userId, {
          courseId: course.id,
          date: "2026-02-04",
          status: "present",
        });

        await store.courses.remove(userId, course.id);
        expect(await store.attendance.list(userId)).toHaveLength(0);
      });
    });

    describe("attendance", () => {
      let course;

      beforeEach(async () => {
        course = await store.courses.create(userId, { code: "DBMS", name: "Databases", weekdays: [1, 3, 5] });
      });

      it("keeps exactly one record per course per day", async () => {
        const first = await store.attendance.upsert(userId, {
          courseId: course.id,
          date: "2026-02-04",
          status: "absent",
        });
        expect(first.created).toBe(true);

        const second = await store.attendance.upsert(userId, {
          courseId: course.id,
          date: "2026-02-04",
          status: "present",
        });
        expect(second.created).toBe(false);
        expect(second.record.id).toBe(first.record.id);

        const all = await store.attendance.list(userId);
        expect(all).toHaveLength(1);
        expect(all[0].status).toBe("present");
      });

      it("treats a timestamp and a bare date as the same day", async () => {
        await store.attendance.upsert(userId, {
          courseId: course.id,
          date: "2026-02-04",
          status: "present",
        });
        const again = await store.attendance.upsert(userId, {
          courseId: course.id,
          date: new Date("2026-02-04T19:45:00Z"),
          status: "absent",
        });

        expect(again.created).toBe(false);
        expect(await store.attendance.list(userId)).toHaveLength(1);
      });

      it("filters by course and date range", async () => {
        const other = await store.courses.create(userId, { code: "SE", name: "SE", weekdays: [3] });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-02", status: "present" });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-09", status: "absent" });
        await store.attendance.upsert(userId, { courseId: other.id, date: "2026-02-04", status: "present" });

        expect(await store.attendance.list(userId, { courseId: course.id })).toHaveLength(2);
        expect(
          await store.attendance.list(userId, { from: "2026-02-03", to: "2026-02-05" }),
        ).toHaveLength(1);
      });

      it("returns records in date order", async () => {
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-09", status: "present" });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-02", status: "present" });

        const dates = (await store.attendance.list(userId)).map((r) => isoDay(r.date));
        expect(dates).toEqual(["2026-02-02", "2026-02-09"]);
      });

      it("counts by course and status", async () => {
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-02", status: "present" });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-04", status: "absent" });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-06", status: "cancelled" });

        const counts = await store.attendance.countsByCourse(userId);
        expect(counts.get(String(course.id))).toEqual({ present: 1, absent: 1, cancelled: 1 });
      });

      it("deletes only your own records", async () => {
        const other = await store.users.create({ username: "other2", passwordHash: "h" });
        const { record } = await store.attendance.upsert(userId, {
          courseId: course.id,
          date: "2026-02-04",
          status: "present",
        });

        expect(await store.attendance.remove(other.id, record.id)).toBe(false);
        expect(await store.attendance.remove(userId, record.id)).toBe(true);
        expect(await store.attendance.list(userId)).toHaveLength(0);
      });

      it("never leaks records between users", async () => {
        const other = await store.users.create({ username: "other3", passwordHash: "h" });
        await store.attendance.upsert(userId, { courseId: course.id, date: "2026-02-04", status: "present" });

        expect(await store.attendance.list(other.id)).toHaveLength(0);
        expect((await store.attendance.countsByCourse(other.id)).size).toBe(0);
      });
    });
  });
}
