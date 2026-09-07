/**
 * MongoDB / Mongoose adapter — the real persistence layer.
 *
 * Implements exactly the same interface as the in-memory store, and is held to
 * it by the shared contract suite in `tests/contract/store.contract.js`. If the
 * two ever diverge, the contract tests fail rather than production quietly
 * behaving differently from the demo.
 *
 * Schema changes from v1, and why:
 *
 *  · `Student.attendance.{dbms,mpmc,…}` — deleted. Those embedded arrays were
 *    declared, indexed by Mongoose, and never written to by any code path: dead
 *    schema that also hardcoded five specific course codes into the data model,
 *    so adding a sixth subject meant a migration.
 *
 *  · `AttendanceSummary` — deleted. Running totals kept beside the ledger they
 *    summarise, with nothing reconciling them; percentages were computed from
 *    the ledger anyway, so the collection was pure drift risk. Totals now come
 *    from an aggregation over the records.
 *
 *  · `AttendanceRecord.course` was a free-text string with no enum, so the API
 *    happily accepted `course: "banana"`. It is now a real reference.
 *
 *  · Records are scoped by `userId`, and every index leads with it, so one
 *    account can never read another's rows.
 */

import mongoose from "mongoose";
import { isoDay, toUtcDay } from "../domain/dates.js";

const { Schema, model, models } = mongoose;

/** Stored dates are always midnight UTC — enforced at the schema boundary. */
const dayField = { type: Date, required: true, set: (v) => toUtcDay(v) };

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3 },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: "" },
    rollNumber: { type: String, default: "" },
    threshold: { type: Number, default: 0.75, min: 0, max: 1 },
  },
  { timestamps: true },
);

const semesterSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, required: true },
    startDate: dayField,
    endDate: dayField,
    holidays: [{ _id: false, date: dayField, name: { type: String, default: "" } }],
    threshold: { type: Number, default: 0.75, min: 0, max: 1 },
  },
  { timestamps: true },
);

semesterSchema.pre("validate", function check(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error("Semester end date must be on or after the start date."));
  }
  next();
});

const courseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    // 0 = Sunday … 6 = Saturday. An array, not a count, because *which* day a
    // class falls on decides whether a given date is markable at all.
    weekdays: {
      type: [Number],
      default: [],
      validate: {
        validator: (days) => days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "Weekdays must be integers from 0 (Sunday) to 6 (Saturday).",
      },
    },
    color: { type: String, default: null },
  },
  { timestamps: true },
);
courseSchema.index({ userId: 1, code: 1 }, { unique: true });

const attendanceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    date: dayField,
    // "cancelled" is not decoration: a class the lecturer called off must leave
    // the denominator, or every cancellation silently damages your percentage.
    status: { type: String, enum: ["present", "absent", "cancelled"], required: true },
    note: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true },
);
attendanceSchema.index({ userId: 1, courseId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ userId: 1, date: 1 });

function models_() {
  return {
    User: models.User ?? model("User", userSchema),
    Semester: models.Semester ?? model("Semester", semesterSchema),
    Course: models.Course ?? model("Course", courseSchema),
    Attendance: models.Attendance ?? model("Attendance", attendanceSchema),
  };
}

const out = (doc) => {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject({ versionKey: false }) : { ...doc };
  o.id = String(o._id);
  delete o._id;
  if (o.userId) o.userId = String(o.userId);
  if (o.courseId) o.courseId = String(o.courseId);
  return o;
};

export function createMongoStore(uri, options = {}) {
  const M = () => models_();

  return {
    kind: "mongo",

    async connect() {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, ...options });
      // Indexes are what make "one record per course per day" true under
      // concurrency; without this the guarantee is only as good as the
      // read-then-write in the service layer.
      await Promise.all(Object.values(M()).map((m) => m.createIndexes()));
      return this;
    },
    async disconnect() {
      await mongoose.connection.close();
    },
    async reset() {
      await Promise.all(Object.values(M()).map((m) => m.deleteMany({})));
    },

    users: {
      async findByUsername(username) {
        return out(await M().User.findOne({ username: String(username).toLowerCase() }));
      },
      async findById(id) {
        return out(await M().User.findById(id));
      },
      async count() {
        return M().User.countDocuments();
      },
      async create(data) {
        return out(await M().User.create(data));
      },
      async update(id, patch) {
        return out(await M().User.findByIdAndUpdate(id, patch, { new: true }));
      },
    },

    semesters: {
      async getByUser(userId) {
        return out(await M().Semester.findOne({ userId }));
      },
      async upsert(userId, data) {
        return out(
          await M().Semester.findOneAndUpdate(
            { userId },
            { $set: { ...data, userId } },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
          ),
        );
      },
    },

    courses: {
      async listByUser(userId) {
        return (await M().Course.find({ userId }).sort({ code: 1 })).map(out);
      },
      async findById(userId, id) {
        if (!mongoose.isValidObjectId(id)) return null;
        return out(await M().Course.findOne({ _id: id, userId }));
      },
      async findByCode(userId, code) {
        return out(await M().Course.findOne({ userId, code: String(code).toUpperCase() }));
      },
      async create(userId, data) {
        // Sorted and de-duplicated on the way in, so both adapters return
        // weekdays in the same order — the store contract checks this.
        const weekdays = [...new Set(data.weekdays ?? [])].sort((a, b) => a - b);
        return out(await M().Course.create({ ...data, weekdays, userId }));
      },
      async update(userId, id, patch) {
        if (!mongoose.isValidObjectId(id)) return null;
        const body = patch.weekdays
          ? { ...patch, weekdays: [...new Set(patch.weekdays)].sort((a, b) => a - b) }
          : patch;
        return out(
          await M().Course.findOneAndUpdate({ _id: id, userId }, body, { new: true, runValidators: true }),
        );
      },
      async remove(userId, id) {
        if (!mongoose.isValidObjectId(id)) return false;
        const res = await M().Course.deleteOne({ _id: id, userId });
        if (res.deletedCount) await M().Attendance.deleteMany({ userId, courseId: id });
        return res.deletedCount > 0;
      },
    },

    attendance: {
      async list(userId, { courseId, from, to } = {}) {
        const q = { userId };
        if (courseId) q.courseId = courseId;
        if (from || to) {
          q.date = {};
          if (from) q.date.$gte = toUtcDay(from);
          if (to) q.date.$lte = toUtcDay(to);
        }
        return (await M().Attendance.find(q).sort({ date: 1 })).map(out);
      },
      async find(userId, courseId, date) {
        if (!mongoose.isValidObjectId(courseId)) return null;
        return out(await M().Attendance.findOne({ userId, courseId, date: toUtcDay(date) }));
      },
      async findById(userId, id) {
        if (!mongoose.isValidObjectId(id)) return null;
        return out(await M().Attendance.findOne({ _id: id, userId }));
      },
      async upsert(userId, { courseId, date, status, note }) {
        const day = toUtcDay(date);
        const existing = await M().Attendance.findOne({ userId, courseId, date: day });
        const doc = await M().Attendance.findOneAndUpdate(
          { userId, courseId, date: day },
          { $set: { status, ...(note === undefined ? {} : { note }) } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
        );
        return { record: out(doc), created: !existing };
      },
      async remove(userId, id) {
        if (!mongoose.isValidObjectId(id)) return false;
        const res = await M().Attendance.deleteOne({ _id: id, userId });
        return res.deletedCount > 0;
      },
      /** One grouped aggregation rather than N queries or a stale summary table. */
      async countsByCourse(userId) {
        const rows = await M().Attendance.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
          { $group: { _id: { courseId: "$courseId", status: "$status" }, n: { $sum: 1 } } },
        ]);
        const map = new Map();
        for (const r of rows) {
          const key = String(r._id.courseId);
          const bucket = map.get(key) ?? { present: 0, absent: 0, cancelled: 0 };
          bucket[r._id.status] = r.n;
          map.set(key, bucket);
        }
        return map;
      },
    },
  };
}

export const __schemas = { userSchema, semesterSchema, courseSchema, attendanceSchema };
export const __helpers = { isoDay, toUtcDay };
