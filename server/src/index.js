#!/usr/bin/env node
/**
 * Server entry point.
 *
 * Its only jobs are: load config, open the store, seed if needed, listen, and
 * shut down cleanly. All the behaviour lives in `createApp`, which is why the
 * test suite can build the same application without any of this running.
 */

import "dotenv/config";

import { loadConfig } from "./config.js";
import { createStore } from "./data/index.js";
import { createApp } from "./http/app.js";
import { seedIfEmpty } from "./seed.js";

async function main() {
  const config = loadConfig();
  const store = await createStore(config);
  await seedIfEmpty(store, config);

  const app = createApp({ store, config });
  const server = app.listen(config.port, () => {
    console.info(`[http] API listening on http://localhost:${config.port}`);
    console.info(`[http] storage: ${store.kind}  ·  allowed origins: ${config.clientOrigins.join(", ")}`);
    if (store.kind === "memory") {
      console.info("[http] running without MongoDB — set MONGO_URI in server/.env to persist data.");
    }
  });

  // Without this a `docker stop` or a Ctrl-C mid-request kills the connection
  // instead of finishing it, and the Mongo pool is left to time out.
  const shutdown = async (signal) => {
    console.info(`\n[http] ${signal} received, shutting down.`);
    server.close(async () => {
      await store.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[fatal]", err.message);
  process.exit(1);
});
