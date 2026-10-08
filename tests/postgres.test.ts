import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { seedDatabase } from "../src/lib/seed";
import { publicData } from "../src/lib/model";
import { manageCatalog, createAgentDraft } from "../src/lib/catalog-service";
import { createTables, initializePostgres, readPostgres, updatePostgres, ConflictError } from "../src/lib/postgres-store";

test("Postgres migration, concurrent writes, rollback and draft isolation", {
  skip: !process.env.GAMESLASH_TEST_DATABASE_URL,
}, async () => {
  assert.ok(!new URL(process.env.GAMESLASH_TEST_DATABASE_URL!).hostname.includes("-pooler."),
    "Use DATABASE_URL_UNPOOLED so the test schema cannot be ignored by the pooler");
  // Dedicated, randomly named schema; never query the production tables.
  const schema = "gameslash_test_" + crypto.randomUUID().replaceAll("-", "");
  const admin = postgres(process.env.GAMESLASH_TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const sql = postgres(process.env.GAMESLASH_TEST_DATABASE_URL!, {
    max: 3, prepare: false, connection: { options: `-c search_path=${schema}` }, onnotice: () => {},
  });
  try {
    await admin`CREATE SCHEMA ${admin(schema)}`;
    const [session] = await sql`SELECT current_schema() AS schema`;
    assert.equal(session.schema, schema, "Refuse to test outside the isolated schema");
    await createTables(sql);
    await assert.rejects(readPostgres(sql), /not been migrated/);
    const seed = seedDatabase();
    await initializePostgres(sql, seed);
    assert.deepEqual(await readPostgres(sql), seed);
    await assert.rejects(initializePostgres(sql, seed), /not empty/);
    const results = await Promise.allSettled(["first draft", "second draft"].map(tagline =>
      updatePostgres(sql, db => { db.draftLayout.tagline = tagline; }, seed.revision)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const rejected = results.find(r => r.status === "rejected");
    assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
    const saved = await readPostgres(sql);
    assert.deepEqual(publicData(saved), publicData(seed));
    await assert.rejects(updatePostgres(sql, db => {
      db.entries[0].title = "Must roll back";
      db.layout.categories = [];
    }));
    assert.deepEqual(await readPostgres(sql), saved);
    await assert.rejects(updatePostgres(sql, db => { db.entries.push(db.entries[0]); }), /Duplicate/);
    await Promise.all(Array.from({ length: 3 }, () => updatePostgres(sql, db => {
      const n = db.limits.test?.count ?? 0;
      db.limits.test = { count: n + 1, reset: Date.now() + 10000 };
    })));
    assert.equal((await readPostgres(sql)).limits.test.count, 3);
    const changed = await updatePostgres(sql, db => {
      db.entries.reverse();
      db.entries[0].title = "Changed title ' with SQL punctuation; --";
      db.entries.pop();
      db.entries.unshift({ ...db.entries[0], id: "new-draft", status: "draft" });
    });
    assert.deepEqual(await readPostgres(sql), changed);
    const withAgent = await updatePostgres(sql, db => {
      manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Isolated test", canWriteDrafts: true });
      createAgentDraft(db, db.agents[0].id, "db-request", { ...seed.entries[0], url: "https://example.com/db-agent-test" });
    });
    assert.deepEqual(await readPostgres(sql), withAgent);
    assert.equal(withAgent.activity.length, 2);
    assert.equal(Object.keys(withAgent.ingestions).length, 1);
  } finally {
    await sql.end();
    await admin`DROP SCHEMA ${admin(schema)} CASCADE`;
    await admin.end();
  }
});
