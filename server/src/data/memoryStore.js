/**
 * In-memory store — the zero-configuration path.
 *
 * `npm run dev` with no MONGO_URI uses this, so the project runs on a fresh
 * machine with nothing installed but Node. That matters more than it sounds:
 * a portfolio project nobody can start is a portfolio project nobody reads.
 *
 * It is also what the test suite runs against, which keeps the whole suite
 * under a second. The Mongo adapter is exercised by the *same* contract tests
 * (see tests/contract/store.contract.js) — so this is a genuine second
 * implementation of one interface, not a mock that agrees with itself.
 *
 * Data lives for the lifetime of the process and is deliberately not persisted.
 */

import { randomBytes } from "node:crypto";
import { isoDay, toUtcDay } from "../domain/dates.js";

const newId = () => randomBytes(12).toString("hex");
const clone = (doc) => (doc == null ? null : structuredClone(doc));

export function createMemoryStore() {
  const users = new Map();
  const semesters = new Map(); // userId -> semester
  const courses = new Map();
  const attendance = new Map();

  /** Key that makes "one record per course per day" a structural guarantee. */
  const attKey = (userId, courseId, date) => `${userId}|${courseId}|${isoDay(date)}`;
  const attIndex = new Map(); // attKey -> attendance id

  return {
    kind: "memory",

    async connect() {
      return this;
    },
    async disconnect() {},
    async reset() {
      users.clear();
      semesters.clear();
      courses.clear();
      attendance.clear();
      attIndex.clear();
    },

    users: {
      async findByUsername(username) {
        for (const u of users.values()) {
          if (u.username === String(username).toLowerCase()) return clone(u);
        }
        return null;
      },
      async findById(id) {
        return clone(users.get(id));
      },
      async count() {
        return users.size;
      },
      async create(data) {
        const doc = {
          id: newId(),
          username: String(data.username).toLowerCase(),
          passwordHash: data.passwordHash,
          displayName: data.displayName ?? data.username,
          rollNumber: data.rollNumber ?? "",
          threshold: data.threshold ?? 0.75,
          createdAt: new Date(),
        };
        users.set(doc.id, doc);
        return clone(doc);
      },
      async update(id, patch) {
        const doc = users.get(id);
        if (!doc) return null;
        Object.assign(doc, patch);
        return clone(doc);
      },
    },

    semesters: {
      async getByUser(userId) {
        return clone(semesters.get(userId) ?? null);
      },
      async upsert(userId, data) {
        const existing = semesters.get(userId);
        const doc = {
          id: existing?.id ?? newId(),
          userId,
          name: data.name,
          startDate: toUtcDay(data.startDate),
          endDate: toUtcDay(data.endDate),
          holidays: (data.holidays ?? []).map((h) => ({
            date: toUtcDay(h.date ?? h),
            name: h.name ?? "",
          })),
          threshold: data.threshold ?? existing?.threshold ?? 0.75,
        };
        semesters.set(userId, doc);
        return clone(doc);
      },
    },

    courses: {
      async listByUser(userId) {
        return [...courses.values()]
          .filter((c) => c.userId === userId)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map(clone);
      },
      async findById(userId, id) {
        const doc = courses.get(id);
        return doc && doc.userId === userId ? clone(doc) : null;
      },
      async findByCode(userId, code) {
        for (const c of courses.values()) {
          if (c.userId === userId && c.code.toLowerCase() === String(code).toLowerCase()) return clone(c);
        }
        return null;
      },
      async create(userId, data) {
        const doc = {
          id: newId(),
          userId,
          code: data.code,
          name: data.name,
          weekdays: [...new Set(data.weekdays ?? [])].sort(),
          color: data.color ?? null,
          createdAt: new Date(),
        };
        courses.set(doc.id, doc);
        return clone(doc);
      },
      async update(userId, id, patch) {
        const doc = courses.get(id);
        if (!doc || doc.userId !== userId) return null;
        if (patch.weekdays) patch = { ...patch, weekdays: [...new Set(patch.weekdays)].sort() };
        Object.assign(doc, patch);
        return clone(doc);
      },
      async remove(userId, id) {
        const doc = courses.get(id);
        if (!doc || doc.userId !== userId) return false;
        courses.delete(id);
        for (const [key, rec] of attendance) {
          if (rec.courseId === id) {
            attendance.delete(key);
            attIndex.delete(attKey(rec.userId, rec.courseId, rec.date));
          }
        }
        return true;
      },
    },

    attendance: {
      async list(userId, { courseId, from, to } = {}) {
        return [...attendance.values()]
          .filter((r) => r.userId === userId)
          .filter((r) => !courseId || r.courseId === courseId)
          .filter((r) => !from || r.date >= toUtcDay(from))
          .filter((r) => !to || r.date <= toUtcDay(to))
          .sort((a, b) => a.date - b.date)
          .map(clone);
      },
      async find(userId, courseId, date) {
        const id = attIndex.get(attKey(userId, courseId, date));
        return id ? clone(attendance.get(id)) : null;
      },
      async findById(userId, id) {
        const doc = attendance.get(id);
        return doc && doc.userId === userId ? clone(doc) : null;
      },
      /** Insert, or overwrite the existing record for that course and day. */
      async upsert(userId, { courseId, date, status, note }) {
        const key = attKey(userId, courseId, date);
        const existingId = attIndex.get(key);
        if (existingId) {
          const doc = attendance.get(existingId);
          doc.status = status;
          doc.note = note ?? doc.note;
          doc.updatedAt = new Date();
          return { record: clone(doc), created: false };
        }
        const doc = {
          id: newId(),
          userId,
          courseId,
          date: toUtcDay(date),
          status,
          note: note ?? "",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        attendance.set(doc.id, doc);
        attIndex.set(key, doc.id);
        return { record: clone(doc), created: true };
      },
      async remove(userId, id) {
        const doc = attendance.get(id);
        if (!doc || doc.userId !== userId) return false;
        attendance.delete(id);
        attIndex.delete(attKey(doc.userId, doc.courseId, doc.date));
        return true;
      },
      /**
       * Attendance counts per course, computed from the records themselves.
       *
       * The previous schema kept a separate `AttendanceSummary` collection with
       * running totals. It was never read when computing percentages, so it was
       * a second copy of the truth that nothing checked — free to drift the
       * moment a record was edited or deleted. Counting from the ledger cannot
       * drift.
       */
      async countsByCourse(userId) {
        const out = new Map();
        for (const r of attendance.values()) {
          if (r.userId !== userId) continue;
          const bucket = out.get(r.courseId) ?? { present: 0, absent: 0, cancelled: 0 };
          bucket[r.status] = (bucket[r.status] ?? 0) + 1;
          out.set(r.courseId, bucket);
        }
        return out;
      },
    },
  };
}
