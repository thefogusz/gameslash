import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { readD1, readD1Notifications, initializeD1, updateD1 } from "../src/lib/d1-store";
import { draftNotifications } from "../src/lib/notifications";
import { publicData } from "../src/lib/model";
import { ConflictError } from "../src/lib/postgres-store";
import { jobSchema } from "../src/lib/collection-model";
import { changeGameLikes, gameLikeCounts } from "../src/lib/game-likes";

test("D1 migration, concurrent CAS, rollback, ordering and private access", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  const url = new URL(process.env.GAMESLASH_TEST_D1_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Only an isolated local D1 is allowed");
  process.env.GAMESLASH_D1_URL = url.origin;
  process.env.GAMESLASH_D1_TOKEN = process.env.GAMESLASH_TEST_D1_TOKEN;
  assert.equal((await fetch(new URL("/catalog", url))).status, 401);
  const seed = seedDatabase();
  seed.collectionJobs.push(jobSchema.parse({ id: crypto.randomUUID(), source: { id: crypto.randomUUID(), name: "Stored posts", url: "https://www.facebook.com/groups/123" }, createdAt: new Date().toISOString(), status: "SUCCEEDED", runId: "fixtureRun", candidates: [{ url: "https://example.com/post", text: "Original source text", author: "Creator", time: "2026-10-09" }] }));
  await initializeD1(seed);
  assert.deepEqual(await readD1(), seed);
  const visitor = "a".repeat(64);
  await updateD1(db => changeGameLikes(db, visitor, { id: "ai-dungeon", liked: true }, "test"), undefined, false);
  await updateD1(db => changeGameLikes(db, visitor, { id: "ai-dungeon", liked: true }, "test"), undefined, false);
  assert.equal(gameLikeCounts(await readD1())["ai-dungeon"], 1);
  assert.equal((await readD1()).revision, seed.revision);
  await assert.rejects(initializeD1(seed), ConflictError);
  const concurrent = await Promise.allSettled(["first draft", "second draft"].map(tagline =>
    updateD1(db => { db.draftLayout.tagline = tagline; }, seed.revision)));
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  const rejected = concurrent.find(result => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
  const before = await readD1();
  assert.deepEqual(publicData(before), publicData(seed));
  await assert.rejects(updateD1(db => { db.layout.categories = []; }));
  await assert.rejects(updateD1(db => { db.entries.push(db.entries[0]); }), /Duplicate/);
  assert.deepEqual(await readD1(), before);
  await Promise.all(Array.from({ length: 3 }, () => updateD1(db => {
    db.limits.test = { count: (db.limits.test?.count ?? 0) + 1, reset: 9999999999999 };
  }, undefined, false)));
  assert.equal((await readD1()).limits.test.count, 3);
  assert.equal((await readD1()).revision, before.revision);
  const changed = await updateD1(db => {
    db.entries.reverse(); db.entries.pop();
    db.entries[0].title = "SQL punctuation ' ; --";
    db.entries.unshift({ ...db.entries[0], id: "new-draft", status: "draft" });
  });
  assert.deepEqual(await readD1(), changed);
  assert.deepEqual(await readD1Notifications(), draftNotifications(changed.entries));
  // Invalid input must not partially change the catalog.
  const request = await fetch(new URL("/catalog", url), {
    headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` },
  });
  const { version } = await request.json();
  const { entries, ...state } = changed;
  const malformed = await fetch(new URL("/catalog", url), {
    method: "PUT", headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: version, state, changed: [{ position: 0, data: { ...entries[0], title: "x" } }], deleted: [] }),
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await readD1(), changed);
  const { entries: _entries, gameLikes: _likes, ...legacyState } = changed;
  const legacyWrite = await fetch(new URL("/catalog", url), {
    method: "PUT", headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: version, state: legacyState, changed: [], deleted: [] }),
  });
  assert.equal(legacyWrite.status, 200);
  assert.deepEqual(await readD1(), changed, "An older app must not wipe existing game likes");
  const large = await updateD1(db => {
    db.entries = Array.from({ length: 160 }, (_, i) => ({
      ...db.entries[0], id: `large-fixture-${i}`, body: "x".repeat(15_000),
    }));
  });
  assert.ok(Buffer.byteLength(JSON.stringify(large)) > 1_800_000);
  assert.deepEqual(await readD1(), large, "Large catalogs must retain split-row reads rather than exceed D1's single-value limit");
});
