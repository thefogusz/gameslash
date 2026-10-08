import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, unlink, rmdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("durable storage, draft isolation and stale-edit protection", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gameslash-test-"));
  process.env.GAMESLASH_DATA_DIR = directory;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL;
  delete process.env.GAMESLASH_STORAGE;
  delete process.env.GAMESLASH_READ_ONLY;
  const { readDatabase, updateDatabase, ConflictError } = await import(
    "../src/lib/store"
  );
  try {
    const initial = await readDatabase();
    await updateDatabase(db => { db.limits.upload = { count:1, reset:Date.now()+60000 }; }, undefined, false);
    assert.equal((await readDatabase()).revision, initial.revision);
    assert.equal((await readDatabase()).limits.upload.count, 1);
    const updated = await updateDatabase((db) => {
      db.draftLayout.tagline = "A saved draft";
    }, initial.revision);
    assert.equal(updated.revision, 1);
    assert.equal((await readDatabase()).draftLayout.tagline, "A saved draft");
    assert.notEqual((await readDatabase()).layout.tagline, "A saved draft");
    await assert.rejects(
      updateDatabase((db) => {
        db.layout.tagline = "Lost update";
      }, initial.revision),
      ConflictError,
    );
    await assert.rejects(
      updateDatabase((db) => {
        db.draftLayout.categories = [];
      }, updated.revision),
    );
    const persisted = JSON.parse(
      await readFile(path.join(directory, "catalog.json"), "utf8"),
    );
    assert.equal(persisted.revision, 1);
    await updateDatabase((db) => {
      db.layout = structuredClone(db.draftLayout);
    }, 1);
    assert.equal((await readDatabase()).layout.tagline, "A saved draft");
  } finally {
    await unlink(path.join(directory, "catalog.json")).catch(() => {});
    await rmdir(directory);
  }
});
