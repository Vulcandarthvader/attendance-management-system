/**
 * Express application factory.
 *
 * A factory, not a module that starts listening on import — that is what makes
 * the app testable. v1's `index.js` called `app.listen()` at module scope, so
 * importing anything from it bound a port; a test suite could never load the
 * app without also starting a server.
 *
 * Everything is injected (store, config), so tests build an app over the
 * in-memory store and production builds the identical app over Mongo.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { createAuthService, publicUser, requireAuth } from "../services/auth.js";
import { createAttendanceService } from "../services/attendance.js";
import { schemas, validate } from "./validation.js";
import { shapeCourse, shapeSemester } from "../services/attendance.js";

export function createApp({ store, config }) {
  const app = express();
  const auth = createAuthService(store, config);
  const attendance = createAttendanceService(store);
  const guard = requireAuth(auth, store);

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      // v1 hardcoded a single localhost origin, so the app could not be
      // deployed anywhere without a code change.
      origin(origin, cb) {
        if (!origin || config.clientOrigins.includes("*") || config.clientOrigins.includes(origin)) {
          return cb(null, true);
        }
        cb(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  // Login is the one endpoint worth brute-forcing, so it gets its own budget.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.isTest ? 10_000 : 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many sign-in attempts. Try again in a few minutes." },
  });

  app.get("/api/health", async (_req, res) => {
    res.json({ status: "ok", storage: store.kind, time: new Date().toISOString() });
  });

  // ---- auth ---------------------------------------------------------------
  app.post("/api/auth/register", loginLimiter, validate(schemas.register), async (req, res, next) => {
    try {
      res.status(201).json({ success: true, ...(await auth.register(req.body)) });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/auth/login", loginLimiter, validate(schemas.login), async (req, res, next) => {
    try {
      res.json({ success: true, ...(await auth.login(req.body)) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/auth/me", guard, (req, res) => {
    res.json({ success: true, user: publicUser(req.user) });
  });

  app.patch("/api/auth/me", guard, validate(schemas.updateProfile), async (req, res, next) => {
    try {
      const user = await store.users.update(req.user.id, req.body);
      res.json({ success: true, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  // ---- semester -----------------------------------------------------------
  app.get("/api/semester", guard, async (req, res, next) => {
    try {
      const semester = await store.semesters.getByUser(req.user.id);
      res.json({ success: true, semester: semester ? shapeSemester(semester) : null });
    } catch (err) {
      next(err);
    }
  });

  app.put("/api/semester", guard, validate(schemas.saveSemester), async (req, res, next) => {
    try {
      const semester = await store.semesters.upsert(req.user.id, req.body);
      res.json({ success: true, semester: shapeSemester(semester) });
    } catch (err) {
      next(err);
    }
  });

  // ---- courses ------------------------------------------------------------
  app.get("/api/courses", guard, async (req, res, next) => {
    try {
      const courses = await store.courses.listByUser(req.user.id);
      res.json({ success: true, courses: courses.map(shapeCourse) });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/courses", guard, validate(schemas.createCourse), async (req, res, next) => {
    try {
      const clash = await store.courses.findByCode(req.user.id, req.body.code);
      if (clash) {
        return next(conflict(`You already have a course with the code ${req.body.code}.`, "course_exists"));
      }
      const course = await store.courses.create(req.user.id, req.body);
      res.status(201).json({ success: true, course: shapeCourse(course) });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/courses/:id", guard, validate(schemas.updateCourse), async (req, res, next) => {
    try {
      const course = await store.courses.update(req.user.id, req.params.id, req.body);
      if (!course) return next(notFound("That course does not exist.", "course_not_found"));
      res.json({ success: true, course: shapeCourse(course) });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/courses/:id", guard, async (req, res, next) => {
    try {
      const removed = await store.courses.remove(req.user.id, req.params.id);
      if (!removed) return next(notFound("That course does not exist.", "course_not_found"));
      res.json({ success: true, removed: true });
    } catch (err) {
      next(err);
    }
  });

  // ---- attendance ---------------------------------------------------------
  app.post("/api/attendance", guard, validate(schemas.markAttendance), async (req, res, next) => {
    try {
      const result = await attendance.mark(req.user, req.body);
      res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/attendance/bulk", guard, validate(schemas.bulkMark), async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.markMany(req.user, req.body.entries)) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/attendance", guard, validate(schemas.listAttendance), async (req, res, next) => {
    try {
      const records = await store.attendance.list(req.user.id, req.query);
      res.json({ success: true, records });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/attendance/:id", guard, async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.remove(req.user, req.params.id)) });
    } catch (err) {
      next(err);
    }
  });

  // ---- derived views ------------------------------------------------------
  app.get("/api/overview", guard, async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.overview(req.user)) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/trend", guard, async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.trend(req.user)) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/calendar", guard, async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.calendar(req.user, req.query)) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/agenda/:date", guard, async (req, res, next) => {
    try {
      res.json({ success: true, ...(await attendance.agenda(req.user, req.params.date)) });
    } catch (err) {
      next(err);
    }
  });

  // ---- fallbacks ----------------------------------------------------------
  app.use((req, _res, next) => next(notFound(`No route for ${req.method} ${req.path}`, "not_found")));

  /**
   * One error shape for the whole API: `{ success, code, message, details }`.
   * v1 returned `error: err.message` on 500s, which leaks stack-adjacent
   * internals and Mongo connection strings to the client.
   */
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.name === "ValidationError" ? 400 : 500);
    if (status >= 500 && !config.isTest) {
      console.error("[error]", err);
    }
    res.status(status).json({
      success: false,
      code: err.code ?? (status >= 500 ? "internal_error" : "error"),
      message: status >= 500 ? "Something went wrong on our side." : err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  });

  return app;
}

function notFound(message, code) {
  const err = new Error(message);
  err.status = 404;
  err.code = code;
  return err;
}

function conflict(message, code) {
  const err = new Error(message);
  err.status = 409;
  err.code = code;
  return err;
}
