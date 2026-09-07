/**
 * The Mongoose adapter, held to the same contract as the in-memory one.
 *
 * Needs a real MongoDB. Point TEST_MONGO_URI at a throwaway database and run
 * `npm test` — the suite drops every collection between tests, so never aim it
 * at anything you care about.
 *
 *   docker run -d -p 27017:27017 --name mongo-test mongo:7
 *   TEST_MONGO_URI=mongodb://127.0.0.1:27017/attendance_test npm test
 *
 * Without that variable the block is skipped rather than silently passing, so
 * a green run always says which adapters were actually exercised.
 */

import { afterAll, beforeAll, describe, it } from "vitest";
import { createMongoStore } from "../../src/data/mongoStore.js";
import { runStoreContract } from "./store.contract.js";

const uri = process.env.TEST_MONGO_URI;

if (!uri) {
  describe("store contract: mongodb", () => {
    it.skip("skipped — set TEST_MONGO_URI to run the Mongo adapter against this contract", () => {});
  });
} else {
  let store;
  beforeAll(async () => {
    store = createMongoStore(uri);
    await store.connect();
  }, 30_000);
  afterAll(async () => {
    await store?.reset();
    await store?.disconnect();
  });

  runStoreContract("mongodb", () => store);
}
