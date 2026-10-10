import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { Miniflare } from "miniflare";
import { seedDatabase } from "../src/lib/seed";

async function run(args: string[], env = process.env) {
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env, windowsHide: true });
    child.on("error", reject); child.on("exit", resolve);
  });
  assert.equal(code, 0);
}
await run(["node_modules/wrangler/wrangler-dist/cli.js", "deploy", "--config", "cloudflare/wrangler.jsonc", "--dry-run", "--outdir", ".data/d1-fixture-worker"]);
const script = await readFile("cloudflare/.data/d1-fixture-worker/worker.js", "utf8");
const mf = new Miniflare({ workers: [{ config: {
  name: "gameslash-d1-test", compatibilityDate: "2026-10-09", compatibilityFlags: ["nodejs_compat"],
  manifest: { mainModule: "worker.js", modules: { "worker.js": { type: "esm", contents: script } } },
  env: { DB: { type: "d1", id: "gameslash-d1-test" }, D1_SERVICE_TOKEN: { type: "json", value: "isolated-test-token" } },
}, dev: {} }] });
try {
  const db = await mf.getD1Database("DB");
  const sql = (await readFile("cloudflare/schema.sql", "utf8")).replace(/^\s*--.*$/gm, "");
  for (const statement of sql.split(";").filter(value => value.trim())) await db.prepare(statement).run();
  const origin = (await mf.ready).origin;
  await run(["--import", "tsx", "--test", "tests/d1.test.ts"], { ...process.env, GAMESLASH_TEST_D1_URL: origin, GAMESLASH_TEST_D1_TOKEN: "isolated-test-token" });
  const headers = { Authorization: "Bearer isolated-test-token", "Content-Type": "application/json" };
  const queue = async (body: unknown) => (await fetch(new URL("/write-queue", origin), { method: "PUT", headers, body: JSON.stringify(body) })).json();
  const first = crypto.randomUUID(), second = crypto.randomUUID();
  await queue({ ticket: first, action: "enqueue" });
  await queue({ ticket: second, action: "enqueue" });
  assert.equal((await queue({ ticket: second, action: "claim" })).status, "queued");
  assert.equal((await queue({ ticket: first, action: "claim" })).status, "running");
  assert.equal((await queue({ ticket: second, action: "claim" })).status, "queued");
  await db.prepare("UPDATE gameslash_write_queue SET expires = 0 WHERE ticket = ?").bind(first).run();
  assert.equal((await queue({ ticket: second, action: "claim" })).status, "running");
  const state = await db.prepare("SELECT version, data FROM gameslash_state WHERE id = 1").first<{ version: number; data: string }>();
  const snapshot = seedDatabase(); const { entries: _entries, ...empty } = snapshot;
  const expired = await fetch(new URL("/catalog", origin), { method: "PUT", headers,
    body: JSON.stringify({ ticket: first, expectedVersion: state!.version, state: empty, changed: [], deleted: [] }) });
  assert.equal(expired.status, 409, "An expired writer must be fenced even when its version is current");
  assert.deepEqual(await db.prepare("SELECT version, data FROM gameslash_state WHERE id = 1").first(), state, "An expired ticket cannot replace any state");
  await queue({ ticket: second, action: "complete", outcome: "failed" });
  console.log(JSON.stringify({ isolatedD1: true, fifo: true, expiredWriterFenced: true, root: path.resolve(".") }));
} finally { await mf.dispose(); }
