import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readDatabase } from "../src/lib/store";
import { initializeD1, readD1 } from "../src/lib/d1-store";
import { databaseClient } from "../src/lib/postgres-store";

assert.equal(process.env.GAMESLASH_STORAGE, "postgres", "Export the current production Postgres source");
assert.equal(process.env.GAMESLASH_READ_ONLY, "true", "Freeze deployed writes before migrating");
try {
  const source = await readDatabase();
  await mkdir(resolve(".data"), { recursive: true });
  const backup = resolve(".data", `catalog-before-d1-${Date.now()}.json`);
  await writeFile(backup, JSON.stringify(source), { flag: "wx", mode: 0o600 });
  await initializeD1(source);
  assert.deepEqual(await readD1(), source, "D1 must exactly match Postgres");
  assert.deepEqual(await readDatabase(), source, "Source changed during migration; do not cut over");
  console.log(JSON.stringify({ migrated: source.entries.length, revision: source.revision, backup, verified: true }));
} finally { await databaseClient().end(); }
