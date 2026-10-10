import test from "node:test";
import assert from "node:assert/strict";
import { D1RequestError, reserveD1Image } from "../src/lib/d1-store";
import { ImageUploadError } from "../src/lib/media-errors";
import { mcpError } from "../src/lib/mcp-errors";

test("image reservations retry identical small requests; unavailable images can be safely retried", async () => {
  const previous = { url: process.env.GAMESLASH_D1_URL, token: process.env.GAMESLASH_D1_TOKEN, fetch: globalThis.fetch };
  process.env.GAMESLASH_D1_URL = "https://image-fixture.invalid";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  const requests: string[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(String(url)).pathname, "/image-reservation");
      const body = String(init?.body);
      assert.ok(Buffer.byteLength(body) < 1024);
      requests.push(body);
      if (requests.length === 1) throw new Error("Response lost after commit");
      return Response.json({ reserved: true });
    };
    await reserveD1Image("a".repeat(64), "00000000-0000-4000-8000-000000000001");
    assert.equal(requests.length, 2);
    assert.equal(requests[0], requests[1]);
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; return new Response(null, { status: 503 }); };
    await assert.rejects(reserveD1Image("b".repeat(64)), error => {
      assert.ok(error instanceof D1RequestError);
      assert.equal(mcpError(error).retryable, true);
      assert.equal(mcpError(error).outcomeUnknown, false);
      return true;
    });
    assert.equal(attempts, 3);
    attempts = 0;
    globalThis.fetch = async () => { attempts++; return new Response(null, { status: 403 }); };
    await assert.rejects(reserveD1Image("c".repeat(64)), D1RequestError);
    assert.equal(attempts, 1, "Permission failures must never retry");
    const failure = mcpError(new ImageUploadError(new Error("Blob connection reset")));
    assert.equal(failure.retryable, true);
    assert.equal(failure.outcomeUnknown, false);
    assert.equal(failure.retryAfterSeconds, 5);
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.GAMESLASH_D1_URL; else process.env.GAMESLASH_D1_URL = previous.url;
    if (previous.token === undefined) delete process.env.GAMESLASH_D1_TOKEN; else process.env.GAMESLASH_D1_TOKEN = previous.token;
  }
});
