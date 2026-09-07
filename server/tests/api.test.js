/**
 * API tests.
 *
 * The app is built over the in-memory store, so the whole suite runs in about a
 * second with no database to install, start or clean between tests. Because the
 * store is injected, this is the *same* application object that production
 * builds over Mongo — not a stubbed variant of it.
 *
 * Most of these are regression tests for things v1 got wrong: unauthenticated
 * access to anyone's data, rules enforced only in the browser, and duplicate
 * detection that depended on the exact millisecond.
 */

import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/http/app.js";
import { createMemoryStore } from "../src/data/memoryStore.js";
import { loadConfig } from "../src/config.js";
import { addDays, isoDay, startOfWeek, todayUtc } from "../src/domain/dates.js";

const config = loadConfig({ NODE_ENV: "test", JWT_SECRET: "test-secret-value-long-enough" });

let store;
let app;

// A semester that always straddles today, so "past" and "future" stay true
// however long this repository sits unrun.
const START = startOfWeek(addDays(todayUtc(), -8 * 7));
const END = addDays(START, 16 * 7);

async function signUp(username = "student", password = "password123") {
  const res = await request(app).post("/api/auth/register").send({ username, password });
  expect(res.status).toBe(201);
  return { token: res.body.token, user: res.body.user, auth: `Bearer ${res.body.token}` };
}

async function setupSemester(auth, overrides = {}) {
  const res = await request(app)
    .put("/api/semester")
    .set("Authorization", auth)
    .send({
      name: "Semester 6",
      startDate: isoDay(START),
      endDate: isoDay(END),
      threshold: 0.75,
      holidays: [],
      ...overrides,
    });
  expect(res.status).toBe(200);
  return res.body.semester;
}

async function addCourse(auth, body = {}) {
  const res = await request(app)
    .post("/api/courses")
    .set("Authorization", auth)
    .send({ code: "DBMS", name: "Databases", weekdays: [1, 3, 5], ...body });
  expect(res.status).toBe(201);
  return res.body.course;
}

/** A recent past date on which `weekday` falls (1 = Monday). */
function recentWeekday(target, weeksBack = 1) {
  let d = addDays(startOfWeek(todayUtc()), -7 * weeksBack);
  while (d.getUTCDay() !== target) d = addDays(d, 1);
  return isoDay(d);
}

beforeEach(async () => {
  store = createMemoryStore();
  await store.connect();
  app = createApp({ store, config });
});

describe("health", () => {
  it("reports which storage backend is in use", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", storage: "memory" });
  });
});

describe("authentication", () => {
  it("registers a user and returns a token, never the password hash", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "Nandita", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe("nandita"); // normalised
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("password123");
  });

  it("rejects weak passwords and malformed usernames before touching the store", async () => {
    const short = await request(app).post("/api/auth/register").send({ username: "abc", password: "123" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("validation_failed");

    const bad = await request(app)
      .post("/api/auth/register")
      .send({ username: "not a username", password: "password123" });
    expect(bad.status).toBe(400);
  });

  it("refuses a duplicate username", async () => {
    await signUp("taken");
    const res = await request(app).post("/api/auth/register").send({ username: "taken", password: "password123" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("username_taken");
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    await signUp("real", "password123");
    const wrongPass = await request(app).post("/api/auth/login").send({ username: "real", password: "nope12345" });
    const noUser = await request(app).post("/api/auth/login").send({ username: "ghost", password: "nope12345" });

    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    // Identical wording, so the response cannot be used to enumerate accounts.
    expect(wrongPass.body.message).toBe(noUser.body.message);
  });

  it("logs in with correct credentials", async () => {
    await signUp("real", "password123");
    const res = await request(app).post("/api/auth/login").send({ username: "real", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe("authorisation", () => {
  it("refuses every data route without a token", async () => {
    // v1 exposed all of these to anyone who knew a roll number.
    for (const [method, path] of [
      ["get", "/api/overview"],
      ["get", "/api/courses"],
      ["get", "/api/semester"],
      ["get", "/api/attendance"],
      ["get", "/api/trend"],
      ["post", "/api/attendance"],
    ]) {
      const res = await request(app)[method](path).send({});
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });

  it("rejects a forged or expired token", async () => {
    const res = await request(app).get("/api/overview").set("Authorization", "Bearer not.a.token");
    expect(res.status).toBe(401);
  });

  it("keeps one account's data invisible to another", async () => {
    const alice = await signUp("alice");
    await setupSemester(alice.auth);
    const course = await addCourse(alice.auth);

    const bob = await signUp("bob");
    const list = await request(app).get("/api/courses").set("Authorization", bob.auth);
    expect(list.body.courses).toHaveLength(0);

    // Bob knows the id but still cannot touch it.
    const patch = await request(app)
      .patch(`/api/courses/${course.id}`)
      .set("Authorization", bob.auth)
      .send({ name: "Hijacked" });
    expect(patch.status).toBe(404);
  });
});

describe("courses", () => {
  it("creates and lists courses", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    await addCourse(auth, { code: "toc", name: "Theory of Computation", weekdays: [1, 4] });

    const res = await request(app).get("/api/courses").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.courses[0].code).toBe("TOC"); // upper-cased by validation
    expect(res.body.courses[0].weekdays).toEqual([1, 4]);
  });

  it("rejects duplicate course codes and invalid weekdays", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    await addCourse(auth);

    const dupe = await request(app)
      .post("/api/courses")
      .set("Authorization", auth)
      .send({ code: "DBMS", name: "Again", weekdays: [2] });
    expect(dupe.status).toBe(409);

    const bad = await request(app)
      .post("/api/courses")
      .set("Authorization", auth)
      .send({ code: "X", name: "Bad", weekdays: [9] });
    expect(bad.status).toBe(400);
  });

  it("deletes a course and its attendance together", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "present" });

    await request(app).delete(`/api/courses/${course.id}`).set("Authorization", auth).expect(200);

    const left = await request(app).get("/api/attendance").set("Authorization", auth);
    expect(left.body.records).toHaveLength(0);
  });
});

describe("marking attendance", () => {
  it("records a class on a valid day", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "present" });

    expect(res.status).toBe(201);
    expect(res.body.record).toMatchObject({ status: "present", courseCode: "DBMS" });
  });

  it("enforces the weekend rule on the server, not just in the browser", async () => {
    // The whole point: v1's weekend check was an onChange handler, so this
    // request succeeded.
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(0), status: "present" }); // a Sunday

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("not_scheduled");
  });

  it("rejects dates outside the semester and in the future", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const before = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: "2001-01-01", status: "present" });
    expect(before.body.code).toBe("outside_semester");

    // The next occurrence of the course's weekday after today.
    let future = addDays(todayUtc(), 1);
    while (![1, 3, 5].includes(future.getUTCDay())) future = addDays(future, 1);
    const ahead = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: isoDay(future), status: "present" });
    expect(ahead.body.code).toBe("future");
  });

  it("rejects holidays", async () => {
    const { auth } = await signUp();
    const holiday = recentWeekday(1);
    await setupSemester(auth, { holidays: [{ date: holiday, name: "Founders Day" }] });
    const course = await addCourse(auth);

    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: holiday, status: "present" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("holiday");
  });

  it("rejects an unknown status instead of storing it", async () => {
    // v1's AttendanceRecord.course had no enum, so `course: "banana"` was
    // accepted and became a phantom subject in the statistics.
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "maybe" });
    expect(res.status).toBe(400);
  });

  it("rejects a course id that is not yours", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: "ffffffffffffffffffffffff", date: recentWeekday(1), status: "present" });
    expect(res.status).toBe(404);
  });

  it("updates rather than duplicating when the same class is marked twice", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    const date = recentWeekday(1);

    const first = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date, status: "absent" });
    expect(first.status).toBe(201);

    // Correcting a mistake must be possible. v1 answered 409 forever and left
    // no way to fix a wrong entry short of editing the database.
    const second = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date, status: "present" });
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);

    const all = await request(app).get("/api/attendance").set("Authorization", auth);
    expect(all.body.records).toHaveLength(1);
    expect(all.body.records[0].status).toBe("present");
  });

  it("treats a timestamped date as the same day as the bare date", async () => {
    // The old duplicate check compared exact instants, so this created a
    // second record for a day already marked.
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    const date = recentWeekday(3);

    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date, status: "present" })
      .expect(201);

    // The API only accepts YYYY-MM-DD now, which is the structural fix.
    const timestamped = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: `${date}T18:30:00Z`, status: "absent" });
    expect(timestamped.status).toBe(400);

    const all = await request(app).get("/api/attendance").set("Authorization", auth);
    expect(all.body.records).toHaveLength(1);
  });

  it("reports per-entry outcomes for a bulk submission", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const res = await request(app)
      .post("/api/attendance/bulk")
      .set("Authorization", auth)
      .send({
        entries: [
          { courseId: course.id, date: recentWeekday(1), status: "present" },
          { courseId: course.id, date: recentWeekday(0), status: "present" }, // Sunday
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[1].code).toBe("not_scheduled");
  });
});

describe("overview and the bunk budget", () => {
  it("counts unmarked past classes against you instead of ignoring them", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "present" });

    const res = await request(app).get("/api/overview").set("Authorization", auth);
    const row = res.body.courses[0];

    // Denominator is scheduled classes so far, not the number of records —
    // otherwise forgetting to mark an absence silently improves your score.
    expect(row.held).toBeGreaterThan(1);
    expect(row.unmarkedCount).toBeGreaterThan(0);
    expect(row.attended).toBe(1);
  });

  it("removes cancelled classes from the denominator", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);

    const before = await request(app).get("/api/overview").set("Authorization", auth);
    const heldBefore = before.body.courses[0].held;

    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "cancelled" });

    const after = await request(app).get("/api/overview").set("Authorization", auth);
    expect(after.body.courses[0].held).toBe(heldBefore - 1);
    expect(after.body.courses[0].cancelled).toBe(1);
  });

  it("returns a bunk budget with an actionable message", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1), status: "present" });

    const res = await request(app).get("/api/overview").set("Authorization", auth);
    const row = res.body.courses[0];
    expect(row).toHaveProperty("canSkip");
    expect(row).toHaveProperty("mustAttend");
    expect(["safe", "tight", "recovering", "unrecoverable"]).toContain(row.status);
    expect(row.message).toBeTruthy();
    expect(res.body.overall.courseCount).toBe(1);
  });

  it("asks for setup rather than failing when no semester exists", async () => {
    const { auth } = await signUp();
    const res = await request(app).get("/api/overview").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
    expect(res.body.semester).toBeNull();
  });

  it("refuses to record attendance before a semester is configured", async () => {
    const { auth } = await signUp();
    const res = await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: "ffffffffffffffffffffffff", date: recentWeekday(1), status: "present" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("no_semester");
  });
});

describe("derived views", () => {
  it("builds a weekly trend the chart can plot", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date: recentWeekday(1, 3), status: "present" });

    const res = await request(app).get("/api/trend").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.points.length).toBeGreaterThan(0);
    for (const p of res.body.points) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
    }
    // Cumulative, so the denominator can only grow.
    const held = res.body.points.map((p) => p.held);
    expect([...held].sort((a, b) => a - b)).toEqual(held);
  });

  it("lists only the classes that actually meet on a given day", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    await addCourse(auth, { code: "DBMS", name: "Databases", weekdays: [1, 3, 5] });
    await addCourse(auth, { code: "MPMC", name: "Microprocessors", weekdays: [2, 4] });

    const monday = await request(app).get(`/api/agenda/${recentWeekday(1)}`).set("Authorization", auth);
    expect(monday.body.items.map((i) => i.course.code)).toEqual(["DBMS"]);

    const sunday = await request(app).get(`/api/agenda/${recentWeekday(0)}`).set("Authorization", auth);
    expect(sunday.body.items).toHaveLength(0);
  });

  it("groups the calendar by day", async () => {
    const { auth } = await signUp();
    await setupSemester(auth);
    const course = await addCourse(auth);
    const date = recentWeekday(3);
    await request(app)
      .post("/api/attendance")
      .set("Authorization", auth)
      .send({ courseId: course.id, date, status: "absent" });

    const res = await request(app).get("/api/calendar").set("Authorization", auth);
    const day = res.body.days.find((d) => d.date === date);
    expect(day.absent).toBe(1);
    expect(day.items[0].code).toBe("DBMS");
  });
});

describe("error handling", () => {
  it("returns a consistent shape and hides internals", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: "not_found" });
    // v1 echoed err.message on 500s, which could include the Mongo URI.
    expect(res.body).not.toHaveProperty("error");
  });

  it("explains which field failed validation", async () => {
    const { auth } = await signUp();
    const res = await request(app)
      .put("/api/semester")
      .set("Authorization", auth)
      .send({ name: "Bad", startDate: "2026-05-01", endDate: "2026-01-01" });

    expect(res.status).toBe(400);
    expect(res.body.details.some((d) => d.field === "endDate")).toBe(true);
  });
});
