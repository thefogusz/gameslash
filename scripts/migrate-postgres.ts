import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { databaseClient, createTables, initializePostgres, readPostgres } from "../src/lib/postgres-store";
import { readDatabase } from "../src/lib/store";

// Run against the frozen legacy source, never an already-active Postgres store.
assert.notEqual(process.env.GAMESLASH_STORAGE, "postgres", "Source must be legacy storage");
assert.equal(process.env.GAMESLASH_READ_ONLY, "true", "Freeze deployed writes before migrating");
assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
const db = await readDatabase();
const backup = resolve(".data", `catalog-before-postgres-${Date.now()}.json`);
await mkdir(resolve(".data"), { recursive: true });
await writeFile(backup, JSON.stringify(db, null, 2), { flag: "wx", mode: 0o600 });
const sql = databaseClient();
try {
  await createTables(sql);
  await initializePostgres(sql, db);
  assert.deepEqual(await readPostgres(sql), db, "Target must exactly match source");
  assert.deepEqual(await readDatabase(), db, "Source changed during migration; do not cut over");
  console.log(JSON.stringify({ migrated: db.entries.length, revision: db.revision, backup, verified: true }));
} finally {
  await sql.end();
}
