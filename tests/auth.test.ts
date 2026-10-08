import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  createSession,
  validSession,
  checkOrigin,
  readBody,
} from "../src/lib/auth";
test("sessions require configured secrets and reject tampering", () => {
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("hex");
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  const token = createSession();
  assert.equal(validSession(token), true);
  assert.equal(validSession(token + "x"), false);
  assert.equal(validSession("1.bad.signature"), false);
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  assert.equal(validSession(token), false);
  delete process.env.ADMIN_PASSWORD;
  assert.equal(validSession(createSession()), false);
});
test("writes reject foreign origins and oversized bodies", async () => {
  assert.throws(() =>
    checkOrigin(
      new Request("https://gameslash.test/api/submit", {
        headers: { Origin: "https://evil.test" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("https://gameslash.test/api/submit", {
        headers: { Origin: "https://gameslash.test" },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3020/api/submit", {
        headers: { Host: "127.0.0.1:3020", Origin: "http://127.0.0.1:3020" },
      }),
    ),
  );
  const request = new Request("https://gameslash.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ large: "x".repeat(100) }),
  });
  await assert.rejects(readBody(request, 30), /ขนาดใหญ่/);
});
