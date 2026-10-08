import test from "node:test";
import assert from "node:assert/strict";
import {
  databaseSchema,
  entryInput,
  publicUrl,
  normalizedUrl,
  checkDuplicate,
  consumeLimit,
  publicData,
} from "../src/lib/model";
import { seedDatabase } from "../src/lib/seed";
test("seed data validates, every published game has a real outbound source", () => {
  const db = databaseSchema.parse(seedDatabase());
  assert.ok(
    db.entries
      .filter((e) => e.kind === "game")
      .every((e) => publicUrl(e.url) && publicUrl(e.sourceUrl)),
  );
});
test("URL boundary rejects scripts, insecure URLs, credentials and local addresses", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://example.com",
    "https://u:p@example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://site.local",
    "data:text/html,hello",
  ])
    assert.equal(publicUrl(url), false, url);
  assert.equal(publicUrl("https://example.com/path?q=x"), true);
  assert.equal(
    entryInput.safeParse({ ...seedDatabase().entries[0], url: "" }).success,
    false,
  );
});
test("deduplication ignores tracking and fragments without collapsing real query parameters", () => {
  assert.equal(
    normalizedUrl("https://example.com/?utm_source=fb&fbclid=1#top"),
    "https://example.com",
  );
  const db = seedDatabase();
  assert.throws(
    () =>
      checkDuplicate(db.entries, {
        id: "new-game",
        kind: "game",
        url: db.entries[0].url + "?utm_source=fb",
      }),
    /มีลิงก์นี้/,
  );
  assert.doesNotThrow(() =>
    checkDuplicate(db.entries, {
      id: db.entries[0].id,
      kind: "game",
      url: db.entries[0].url,
    }),
  );
  assert.notEqual(
    normalizedUrl("https://example.com/?game=1"),
    normalizedUrl("https://example.com/?game=2"),
  );
});
test("community posts can discuss a game already in the directory", () => {
  const db = seedDatabase();
  assert.doesNotThrow(() =>
    checkDuplicate(db.entries, {
      id: "discussion",
      kind: "post",
      url: db.entries[0].url,
    }),
  );
});
test("unpublished records and draft layout never enter public data", () => {
  const db = seedDatabase();
  db.entries[0].status = "pending";
  db.entries[1].status = "draft";
  db.draftLayout.tagline = "PRIVATE DRAFT";
  const result = publicData(db);
  assert.equal(result.entries.length, db.entries.length - 2);
  assert.notEqual(result.layout.tagline, "PRIVATE DRAFT");
  assert.equal("limits" in result, false);
});
test("submission limit blocks excess requests and expires", () => {
  const db = seedDatabase();
  consumeLimit(db, "test", 2, 100, 0);
  consumeLimit(db, "test", 2, 100, 1);
  assert.throws(() => consumeLimit(db, "test", 2, 100, 2), /บ่อยเกินไป/);
  assert.doesNotThrow(() => consumeLimit(db, "test", 2, 100, 101));
});
