import test from "node:test";
import assert from "node:assert/strict";
import { updateD1 } from "../src/lib/d1-store";
import { seedDatabase } from "../src/lib/seed";
import { ConflictError } from "../src/lib/postgres-store";

test("D1 skips unchanged saves and preserves stable positions on inserts and deletes", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GAMESLASH_D1_URL, originalToken = process.env.GAMESLASH_D1_TOKEN;
  process.env.GAMESLASH_D1_URL = "http://127.0.0.1:8792";
  process.env.GAMESLASH_D1_TOKEN = "test";
  let db = seedDatabase();
  db.entries = Array.from({ length: 281 }, (_, i) => ({ ...db.entries[0], id: `fixture-${i}` }));
  let version = 1;
  let supportsStablePositions = true;
  const positions = new Map(db.entries.map((entry, i) => [entry.id, i]));
  const writes: { stablePositions?: boolean; changed: { position: number; data: { id: string } }[]; deleted: string[] }[] = [];
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "PUT") {
      const body = JSON.parse(String(options.body));
      writes.push(body);
      for (const row of body.changed) positions.set(row.data.id, row.position);
      for (const id of body.deleted) positions.delete(id);
      db = { ...body.state, entries: [...db.entries.filter(entry => !body.deleted.includes(entry.id))] };
      for (const row of body.changed) {
        const index = db.entries.findIndex(entry => entry.id === row.data.id);
        if (index === -1) db.entries.push(row.data); else db.entries[index] = row.data;
      }
      db.entries.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
      return Response.json({ version: ++version });
    }
    return Response.json({ version, supportsGameLikes: true, supportsFeedback: true, supportsStablePositions,
      db: { ...db, entries: db.entries.map(entry => ({ ...entry, _d1Position: positions.get(entry.id) })) } });
  };
  try {
    const initialRevision = db.revision;
    assert.deepEqual(await updateD1(() => {}), db);
    assert.equal(writes.length, 0, "No-op saves must not consume writes or bump revisions");
    await assert.rejects(updateD1(() => {}, initialRevision + 1), ConflictError);
    const inserted = await updateD1(current => current.entries.unshift({ ...current.entries[0], id: "new-first" }));
    assert.equal(writes[0].changed.length, 1, "Prepending must not rewrite the 281 existing entries");
    assert.equal(writes[0].stablePositions, true);
    assert.equal(writes[0].changed[0].position, -1);
    assert.equal(inserted.entries[0].id, "new-first");
    assert.equal(inserted.revision, initialRevision + 1);
    assert.ok(!Object.hasOwn(inserted.entries[0], "_d1Position"));
    await updateD1(current => { current.entries.splice(50, 1); });
    assert.equal(writes[1].changed.length, 0, "Deleting must not rewrite following entries");
    assert.equal(writes[1].deleted.length, 1);
    await updateD1(current => { current.entries[1].title = "Edited fixture"; });
    assert.equal(writes[2].changed.length, 1);
    const reordered = await updateD1(current => { current.entries.reverse(); });
    assert.deepEqual(db.entries.map(entry => entry.id), reordered.entries.map(entry => entry.id));
    supportsStablePositions = false;
    const legacy = await updateD1(current => current.entries.unshift({ ...current.entries[0], id: "old-worker-first" }));
    assert.equal(writes[4].stablePositions, false);
    assert.equal(writes[4].changed.length, legacy.entries.length, "Older Workers retain the ordinal protocol");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GAMESLASH_D1_URL; else process.env.GAMESLASH_D1_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GAMESLASH_D1_TOKEN; else process.env.GAMESLASH_D1_TOKEN = originalToken;
  }
});
