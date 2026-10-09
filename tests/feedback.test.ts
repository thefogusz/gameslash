import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { feedbackInput, reserveFeedback } from "../src/lib/feedback";
import { seedDatabase } from "../src/lib/seed";
import { databaseSchema, publicData } from "../src/lib/model";
import { manageCatalog, managementMutation } from "../src/lib/catalog-service";

test("feedback validation, legacy data, limits and ticket lifecycle", () => {
  assert.equal(feedbackInput.parse({ message: "  feedback  ", page: "/games" }).message, "feedback");
  for (const input of [{ message: "  ", page: "/" }, { message: "hello", page: "//evil.com" }, { message: "hello", page: "/", image: "data:image/svg+xml;base64,AAAA" }]) assert.equal(feedbackInput.safeParse(input).success, false);
  const db = seedDatabase();
  const { feedback: _feedback, ...legacy } = db;
  assert.deepEqual(databaseSchema.parse(legacy).feedback, []);
  for (let i = 0; i < 5; i++) reserveFeedback(db, "visitor");
  assert.throws(() => reserveFeedback(db, "visitor"), /บ่อย/);
  const id = crypto.randomUUID();
  db.feedback.push({ id, message: "private feedback", page: "/games", image: "", status: "open", createdAt: new Date().toISOString() });
  assert.equal("feedback" in publicData(db), false);
  manageCatalog(db, managementMutation.parse({ action: "feedback_status", revision: 0, id, status: "closed" }));
  assert.equal(db.feedback[0].status, "closed");
  assert.throws(() => manageCatalog(db, managementMutation.parse({ action: "feedback_status", revision: 0, id: crypto.randomUUID(), status: "closed" })), /ไม่พบ/);
});

test("feedback image storage is isolated from public media and survives a database read", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "feedback-test-"));
  process.env.GAMESLASH_DATA_DIR = directory;
  for (const key of ["BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID", "VERCEL", "GAMESLASH_STORAGE", "GAMESLASH_READ_ONLY"]) delete process.env[key];
  const { saveImage, readImage } = await import("../src/lib/media");
  const { readDatabase, updateDatabase } = await import("../src/lib/store");
  try {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const saved = await saveImage(bytes, undefined, "feedback");
    const id = saved.url.split("/").at(-1)!;
    assert.equal(await readImage(id), null);
    assert.ok(await readImage(id, "feedback"));
    await assert.rejects(saveImage(Buffer.from("invalid"), undefined, "feedback"));
    await updateDatabase(db => db.feedback.push({ id: crypto.randomUUID(), message: "test feedback", page: "/", image: saved.url, status: "open", createdAt: new Date().toISOString() }), undefined, false);
    assert.equal((await readDatabase()).feedback[0].image, saved.url);
    assert.equal((await readDatabase()).revision, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
