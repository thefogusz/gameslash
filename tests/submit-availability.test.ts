import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/submit/route";

test("submission availability checks storage without writing and reports outages", async t => {
  const keys = ["GAMESLASH_STORAGE", "GAMESLASH_D1_URL", "GAMESLASH_D1_TOKEN", "GAMESLASH_READ_ONLY"] as const;
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
  }));
  process.env.GAMESLASH_STORAGE = "d1";
  process.env.GAMESLASH_D1_URL = "https://storage.test";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  delete process.env.GAMESLASH_READ_ONLY;
  let status = 200;
  const fetch = t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    assert.equal(url.pathname, "/tags");
    assert.equal(options.method, "GET");
    return status === 200 ? Response.json([]) : new Response("Worker unavailable", { status });
  });
  const ready = await GET();
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ok: true });
  assert.equal(ready.headers.get("cache-control"), "no-store");
  status = 429;
  assert.equal((await GET()).status, 503);
  process.env.GAMESLASH_READ_ONLY = "true";
  assert.equal((await GET()).status, 503);
  assert.equal(fetch.mock.callCount(), 2);
});
