import test from "node:test";
import assert from "node:assert/strict";
import { updateD1 } from "../src/lib/d1-store";
import { seedDatabase } from "../src/lib/seed";

test("an older D1 worker cannot silently discard feedback tickets", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GAMESLASH_D1_URL, originalToken = process.env.GAMESLASH_D1_TOKEN;
  process.env.GAMESLASH_D1_URL = "http://127.0.0.1:8791";
  process.env.GAMESLASH_D1_TOKEN = "test";
  let writes = 0;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "PUT") writes++;
    return Response.json({ version: 1, supportsGameLikes: true, db: seedDatabase() });
  };
  try {
    await assert.rejects(updateD1(db => db.feedback.push({ id: crypto.randomUUID(), message: "private feedback", page: "/", image: "", status: "open", createdAt: new Date().toISOString() }), undefined, false), /D1 Worker/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GAMESLASH_D1_URL; else process.env.GAMESLASH_D1_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GAMESLASH_D1_TOKEN; else process.env.GAMESLASH_D1_TOKEN = originalToken;
  }
});
