import test from "node:test";
import assert from "node:assert/strict";
import { D1RequestError, readD1Tags, reserveD1Image } from "../src/lib/d1-store";
import { mcpError } from "../src/lib/mcp-errors";
import { errorResponse } from "../src/lib/http";

test("Worker 1027 pauses reads and writes until midnight, then resumes", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 10, 23) });
  const keys = ["GAMESLASH_D1_URL", "GAMESLASH_D1_TOKEN"] as const;
  const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
  }));
  process.env.GAMESLASH_D1_URL = "https://worker-quota.test";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  let status = 429;
  let html = "<html>Error <span>1027</span> This website has been temporarily rate limited</html>";
  const fetch = t.mock.method(globalThis, "fetch", async () => status === 200 ? Response.json([])
    : new Response(html, { status, headers: { "Content-Type": "text/html" } }));
  function exhausted(error: unknown) {
    assert.ok(error instanceof D1RequestError);
    const failure = mcpError(error);
    assert.equal(failure.code, "QUOTA_EXHAUSTED");
    assert.equal(failure.retryable, false);
    assert.equal(failure.outcomeUnknown, false);
    assert.equal(failure.resetAt, "2026-10-11T00:00:00.000Z");
    assert.match(failure.message, /โควต้าคำขอ/);
    assert.equal(errorResponse(error).headers.get("Retry-After"), "3600");
    return true;
  }
  await assert.rejects(reserveD1Image("a".repeat(64), "fixture"), exhausted);
  await assert.rejects(readD1Tags(), exhausted);
  await assert.rejects(reserveD1Image("b".repeat(64), "fixture"), exhausted);
  assert.equal(fetch.mock.callCount(), 1);
  status = 200;
  t.mock.timers.tick(3_600_000);
  assert.deepEqual(await readD1Tags(), []);
  assert.equal(fetch.mock.callCount(), 2);
  status = 429; html = "Temporary rate limit without a daily quota error";
  for (let i = 0; i < 2; i++) await assert.rejects(readD1Tags(), error => {
    assert.ok(error instanceof D1RequestError);
    assert.equal(error.resetAt, undefined);
    assert.equal(mcpError(error).retryable, true);
    return true;
  });
  assert.equal(fetch.mock.callCount(), 4, "Ordinary 429 errors must not disable storage for the day");
});
