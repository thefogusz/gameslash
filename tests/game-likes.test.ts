import test from "node:test";
import assert from "node:assert/strict";
import { changeGameLikes, gameLikeCounts, likeMutation } from "../src/lib/game-likes";
import { databaseSchema, publicData } from "../src/lib/model";
import { seedDatabase } from "../src/lib/seed";

const first = "a".repeat(64), second = "b".repeat(64);

test("likes count each browser once, undo independently and import old favorites idempotently", () => {
  const db = seedDatabase();
  const revision = db.revision;
  const game = db.entries.find(e => e.kind === "game" && e.status === "published")!;
  changeGameLikes(db, first, { id: game.id, liked: true }, "first");
  changeGameLikes(db, first, { id: game.id, liked: true }, "first");
  assert.equal(gameLikeCounts(db)[game.id], 1);
  changeGameLikes(db, second, { importIds: [game.id, game.id, "missing"] }, "second");
  changeGameLikes(db, second, { importIds: [game.id] }, "second");
  assert.equal(gameLikeCounts(db)[game.id], 2);
  assert.deepEqual(db.gameLikes[second], [game.id]);
  changeGameLikes(db, first, { id: game.id, liked: false }, "first");
  changeGameLikes(db, first, { id: game.id, liked: false }, "first");
  assert.equal(gameLikeCounts(db)[game.id], 1);
  assert.equal(db.gameLikes[first], undefined);
  game.status = "archived";
  changeGameLikes(db, second, { id: game.id, liked: false }, "second");
  assert.equal(gameLikeCounts(db)[game.id], 0);
  assert.equal(db.revision, revision);
  assert.ok(!("gameLikes" in publicData(db)));
});

test("only published games can be liked, untrusted input is rejected and writes are limited", () => {
  const db = seedDatabase();
  db.entries.push({ ...db.entries[0], id: "private", status: "draft" });
  db.entries.push({ ...db.entries[0], id: "constructor", kind: "game", status: "published" });
  assert.throws(() => changeGameLikes(db, first, { id: "private", liked: true }, "test"), /ไม่พบเกม/);
  assert.throws(() => changeGameLikes(db, first, { id: "missing", liked: true }, "test"), /ไม่พบเกม/);
  changeGameLikes(db, first, { importIds: ["private", "constructor"] }, "test");
  assert.deepEqual(db.gameLikes[first], ["constructor"]);
  assert.equal(gameLikeCounts(db).constructor, 1);
  assert.equal(likeMutation.safeParse({ id: "constructor", liked: "true" }).success, false);
  assert.equal(likeMutation.safeParse({ id: "<script>", liked: true }).success, false);
  assert.equal(likeMutation.safeParse({ importIds: Array(3001).fill("constructor") }).success, false);
  assert.equal(likeMutation.safeParse({ id: "constructor", liked: true, visitor: second }).success, false);
  db.limits["likes:test"] = { count: 120, reset: Date.now() + 60_000 };
  assert.throws(() => changeGameLikes(db, first, { id: "constructor", liked: false }, "test"), /บ่อยเกินไป/);
  assert.deepEqual(db.gameLikes[first], ["constructor"]);
});

test("existing catalogs default to no likes and retain likes through schema validation", () => {
  const { gameLikes: _old, ...legacy } = seedDatabase();
  assert.deepEqual(databaseSchema.parse(legacy).gameLikes, {});
  const db = seedDatabase();
  db.gameLikes[first] = ["ai-dungeon"];
  assert.deepEqual(databaseSchema.parse(db).gameLikes, db.gameLikes);
});
