/** The in-memory adapter, held to the shared store contract. */

import { beforeAll } from "vitest";
import { createMemoryStore } from "../../src/data/memoryStore.js";
import { runStoreContract } from "./store.contract.js";

let store;
beforeAll(async () => {
  store = createMemoryStore();
  await store.connect();
});

runStoreContract("in-memory", () => store);
