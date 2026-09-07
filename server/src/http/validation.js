/**
 * Request schemas and the middleware that applies them.
 *
 * v1 validated with `if (!name || !rollNumber)` inside each controller, and the
 * interesting rules — weekends, the semester window — lived only in the
 * browser. The README claimed "the backend restricts attendance to valid
 * semester dates"; it did not, and a two-line curl could record attendance for
 * a Sunday in 2019 under a course code that did not exist.
 *
 * Client-side validation is a convenience for the user. Server-side validation
 * is the only kind that is actually enforcement.
 */

import { z } from "zod";

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const isoDay = z
  .string()
  .regex(ISO_DAY, "Date must be in YYYY-MM-DD form")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real calendar date");

const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Pick at least one day the course meets")
  .max(7)
  .transform((d) => [...new Set(d)].sort());

export const schemas = {
  register: z.object({
    body: z.object({
      username: z
        .string()
        .trim()
        .min(3, "Username needs at least 3 characters")
        .max(32)
        .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, dash and underscore only"),
      password: z.string().min(8, "Password needs at least 8 characters").max(128),
      displayName: z.string().trim().max(80).optional(),
      rollNumber: z.string().trim().max(32).optional(),
    }),
  }),

  login: z.object({
    body: z.object({
      username: z.string().trim().min(1),
      password: z.string().min(1),
    }),
  }),

  updateProfile: z.object({
    body: z.object({
      displayName: z.string().trim().max(80).optional(),
      rollNumber: z.string().trim().max(32).optional(),
      threshold: z.number().min(0).max(1).optional(),
    }),
  }),

  saveSemester: z.object({
    body: z
      .object({
        name: z.string().trim().min(1).max(80),
        startDate: isoDay,
        endDate: isoDay,
        threshold: z.number().min(0).max(1).optional(),
        holidays: z
          .array(z.object({ date: isoDay, name: z.string().trim().max(80).optional().default("") }))
          .max(120)
          .optional()
          .default([]),
      })
      .refine((v) => v.startDate <= v.endDate, {
        message: "The semester cannot end before it starts",
        path: ["endDate"],
      }),
  }),

  createCourse: z.object({
    body: z.object({
      code: z.string().trim().min(1).max(16).toUpperCase(),
      name: z.string().trim().min(1).max(80),
      weekdays,
      color: z.string().trim().max(32).nullish(),
    }),
  }),

  updateCourse: z.object({
    body: z.object({
      code: z.string().trim().min(1).max(16).toUpperCase().optional(),
      name: z.string().trim().min(1).max(80).optional(),
      weekdays: weekdays.optional(),
      color: z.string().trim().max(32).nullish(),
    }),
  }),

  markAttendance: z.object({
    body: z.object({
      courseId: z.string().trim().min(1),
      date: isoDay,
      // The enum is the point: v1's `course` field accepted any string at all,
      // so a typo created a phantom subject that then appeared in the stats.
      status: z.enum(["present", "absent", "cancelled"]),
      note: z.string().trim().max(200).optional(),
    }),
  }),

  bulkMark: z.object({
    body: z.object({
      entries: z
        .array(
          z.object({
            courseId: z.string().trim().min(1),
            date: isoDay,
            status: z.enum(["present", "absent", "cancelled"]),
            note: z.string().trim().max(200).optional(),
          }),
        )
        .min(1)
        .max(200),
    }),
  }),

  listAttendance: z.object({
    query: z.object({
      courseId: z.string().trim().min(1).optional(),
      from: isoDay.optional(),
      to: isoDay.optional(),
    }),
  }),
};

/**
 * Validate `req` against a schema, replacing the raw input with the parsed
 * result so controllers only ever see coerced, trimmed, known-shaped data.
 *
 * Assigning to `req.query` is done property-by-property: Express 5 defines it
 * as a getter, and a straight assignment throws.
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.filter((p) => p !== "body" && p !== "query" && p !== "params").join(".") || "_",
        message: i.message,
      }));
      const err = new Error(details[0]?.message ?? "Invalid request");
      err.status = 400;
      err.code = "validation_failed";
      err.details = details;
      return next(err);
    }
    if (result.data.body) req.body = result.data.body;
    if (result.data.params) req.params = result.data.params;
    if (result.data.query) {
      for (const [k, v] of Object.entries(result.data.query)) req.query[k] = v;
    }
    next();
  };
}
