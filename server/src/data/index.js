/**
 * Store selection.
 *
 * One switch decides how the app persists, and nothing above this file knows
 * or cares which way it went.
 *
 *   MONGO_URI set   → Mongoose against that database
 *   otherwise       → in-memory, seeded with a demo semester
 *
 * The fallback is what makes `npm run dev` work on a machine with no database
 * installed. It is announced loudly at boot, because silently running on
 * throwaway storage is exactly the kind of surprise that wastes an afternoon.
 */

import { createMemoryStore } from "./memoryStore.js";
import { createMongoStore } from "./mongoStore.js";

export async function createStore(config, logger = console) {
  if (config.mongoUri) {
    const store = createMongoStore(config.mongoUri);
    try {
      await store.connect();
      logger.info?.(`[db] connected to MongoDB (${redact(config.mongoUri)})`);
      return store;
    } catch (err) {
      if (!config.allowMemoryFallback) throw err;
      logger.warn?.(`[db] MongoDB unreachable (${err.message}) — falling back to in-memory storage.`);
    }
  }

  const store = createMemoryStore();
  await store.connect();
  logger.info?.("[db] using in-memory storage — data is discarded when the server stops.");
  return store;
}

/** Never log a connection string with its password in it. */
export function redact(uri) {
  return String(uri).replace(/\/\/([^:@/]+):([^@]+)@/, "//$1:***@");
}

export { createMemoryStore, createMongoStore };
