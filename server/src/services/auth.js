/**
 * Authentication.
 *
 * v1 had none. Every endpoint took a roll number as a plain path parameter, so
 * `GET /api/attendance/19` returned that student's record to anyone who asked,
 * and `POST /api/attendance` let anyone mark anyone present. For an app whose
 * README calls it personal, the data was effectively public.
 *
 * Passwords are hashed with bcrypt (never stored, never logged, never returned).
 * Sessions are stateless JWTs, which suits a single-user app with no revocation
 * requirement; anything needing logout-everywhere would want a token store.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const BCRYPT_ROUNDS = 10;

export function createAuthService(store, config) {
  return {
    async register({ username, password, displayName, rollNumber }) {
      const existing = await store.users.findByUsername(username);
      if (existing) {
        const err = new Error("That username is already taken.");
        err.status = 409;
        err.code = "username_taken";
        throw err;
      }
      const user = await store.users.create({
        username,
        passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
        displayName: displayName || username,
        rollNumber: rollNumber || "",
      });
      return { user: publicUser(user), token: sign(user, config) };
    },

    async login({ username, password }) {
      const user = await store.users.findByUsername(username);
      // Compare against a dummy hash when the user does not exist, so that a
      // missing username and a wrong password take the same time to answer.
      // Otherwise the response time tells an attacker which usernames are real.
      const hash = user?.passwordHash ?? DUMMY_HASH;
      const ok = await bcrypt.compare(password, hash);

      if (!user || !ok) {
        const err = new Error("Incorrect username or password.");
        err.status = 401;
        err.code = "invalid_credentials";
        throw err;
      }
      return { user: publicUser(user), token: sign(user, config) };
    },

    verify(token) {
      try {
        return jwt.verify(token, config.jwtSecret);
      } catch {
        return null;
      }
    },
  };
}

// bcrypt hash of a string nobody will guess; only its cost matters.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function sign(user, config) {
  return jwt.sign({ sub: String(user.id), username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

/** Attaches `req.user`, or rejects. Applied to every route that touches data. */
export function requireAuth(authService, store) {
  return async (req, _res, next) => {
    const header = req.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) {
      return next(unauthorized("Sign in to continue."));
    }
    const claims = authService.verify(token);
    if (!claims?.sub) {
      return next(unauthorized("Your session has expired. Sign in again."));
    }
    const user = await store.users.findById(claims.sub);
    if (!user) {
      return next(unauthorized("That account no longer exists."));
    }
    req.user = user;
    next();
  };
}

function unauthorized(message) {
  const err = new Error(message);
  err.status = 401;
  err.code = "unauthorized";
  return err;
}
