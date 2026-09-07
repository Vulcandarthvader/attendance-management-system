/**
 * Configuration, validated once at boot.
 *
 * The v1 `.env` contained `PORT=50001  # Change to match...`. dotenv does not
 * strip trailing comments, so that variable's value was the string
 * `"50001  # Change to match the port your server is actually using"`. It never
 * mattered only because `index.js` ignored `process.env.PORT` and hardcoded
 * 5000 — two bugs cancelling out, which is worse than one, because the moment
 * you fix either the app moves to a port nothing is talking to.
 *
 * Config is now parsed and range-checked here, and the server refuses to start
 * on nonsense rather than discovering it three layers down.
 */

import { z } from "zod";

const port = z.coerce.number().int().min(1).max(65535);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: port.default(5000),
  MONGO_URI: z.string().trim().min(1).optional(),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  SEED_DEMO: z
    .enum(["true", "false", "auto"])
    .default("auto")
    .describe("auto = seed only when the database is empty"),
  DEMO_USERNAME: z.string().default("demo"),
  DEMO_PASSWORD: z.string().default("demo1234"),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;

  // A missing JWT secret is fatal in production and auto-generated elsewhere,
  // so the demo needs no setup while a real deployment cannot start with a
  // guessable default — the usual middle option, a hardcoded fallback secret,
  // is how tokens end up forgeable in production.
  let jwtSecret = e.JWT_SECRET;
  if (!jwtSecret) {
    if (e.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be set in production (32+ random characters).");
    }
    jwtSecret = randomSecret();
  }

  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === "production",
    isTest: e.NODE_ENV === "test",
    port: e.PORT,
    mongoUri: e.MONGO_URI || null,
    allowMemoryFallback: e.NODE_ENV !== "production",
    jwtSecret,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    clientOrigins: e.CLIENT_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    seedDemo: e.SEED_DEMO,
    demoUsername: e.DEMO_USERNAME,
    demoPassword: e.DEMO_PASSWORD,
  };
}

function randomSecret() {
  // Regenerated per process: restarting the dev server invalidates old tokens,
  // which is the correct behaviour for a throwaway secret.
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
