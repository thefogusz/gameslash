import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { databaseSchema, entryInput, publicData } from "../src/lib/model";
import { gameTags, findGameTag, baseGameTags, tagKey } from "../src/lib/game-tags";
import { validateGameTags, requestGameTags, resolveGameTag, requireTagAgent } from "../src/lib/tag-service";
import { manageCatalog, authenticateAgent, createAgentDraft } from "../src/lib/catalog-service";

function fixture() {
  const db = seedDatabase();
  const entry = db.entries[0]; entry.status = "pending";
  requestGameTags(db, entry, [{ name: "Prompt-shaped worlds", reason: "The game rebuilds its world from player prompts." }]);
  const resolution = { requestId: db.tagRequests[0].id, expectedUpdatedAt: entry.updatedAt, decision: "add" as const, name: "Prompt-shaped worlds", reason: "Reviewed the creator's gameplay documentation showing prompt-driven world editing.", evidenceUrls: ["https://example.com/game/docs"] };
  return { db, entry, resolution };
}
test("Steam snapshot is bilingual, unique and survives old database migration", () => {
  assert.equal(baseGameTags.filter(t => t.id.startsWith("steam:")).length, 429);
  assert.equal(new Set(baseGameTags.map(t => t.id)).size, baseGameTags.length);
  assert.equal(new Set(baseGameTags.map(t => tagKey(t.name))).size, baseGameTags.length);
  assert.ok(baseGameTags.every(t => t.thai && t.name.length <= 60));
  assert.equal(findGameTag(baseGameTags, "ผจญภัย")?.name, "Adventure");
  assert.equal(findGameTag(baseGameTags, "  ROGUELIKE  ")?.name, "Roguelike");
  const { customTags: _c, tagRequests: _r, ...old } = seedDatabase();
  const migrated = databaseSchema.parse(old);
  assert.deepEqual(migrated.customTags, []); assert.deepEqual(migrated.tagRequests, []);
});
test("all write paths share tag validation; unknown legacy values remain editable only on their original game", () => {
  const db = seedDatabase(), old = structuredClone(db.entries[0]);
  const entry = { ...old, id: "new-game", url: "https://example.com/new", tags: ["ผจญภัย", "Adventure", "RPG"] };
  validateGameTags(db, entry); assert.deepEqual(entry.tags, ["Adventure", "RPG"]);
  entry.tags = ["made up"];
  assert.throws(() => validateGameTags(db, entry), /ไม่พบแท็ก/);
  assert.throws(() => manageCatalog(db, { action: "entry", revision: 0, entry }), /ไม่พบแท็ก/);
  assert.throws(() => manageCatalog(db, { action: "import", revision: 0, entries: [entryInput.parse(entry)] }), /ไม่พบแท็ก/);
  old.tags = ["historic game label"];
  validateGameTags(db, { ...old }, old);
  assert.equal(findGameTag(gameTags(db), "historic game label"), undefined);
  assert.equal(entryInput.safeParse({ ...entry, tags: Array(21).fill("RPG") }).success, false);
});
test("proposals are private, deduplicated and gate publishing until reviewed", () => {
  const { db, entry } = fixture();
  requestGameTags(db, entry, [{ name: " PROMPT-shaped worlds ", reason: "A repeated suggestion must not duplicate the queue." }]);
  assert.equal(db.tagRequests.length, 1);
  assert.throws(() => requestGameTags(db, entry, [{ name: "ผจญภัย", reason: "This already exists under its English name." }]), /มีแท็กนี้/);
  assert.equal("tagRequests" in publicData(db), false);
  assert.equal(JSON.stringify(publicData(db)).includes("Prompt-shaped worlds"), false);
  assert.throws(() => manageCatalog(db, { action: "review", id: entry.id, expectedUpdatedAt: entry.updatedAt, revision: 0, decision: "publish", note: "" }), /รอ Dots/);
});
test("adding requires evidence and a fresh game version; duplicate decisions and synonyms cannot add tags", () => {
  const { db, entry, resolution } = fixture();
  assert.throws(() => resolveGameTag(db, { ...resolution, expectedUpdatedAt: "2000-01-01T00:00:00.000Z" }, "Dots"), /ข้อมูลเกมเปลี่ยน/);
  assert.throws(() => resolveGameTag(db, { ...resolution, evidenceUrls: [] }, "Dots"));
  assert.throws(() => resolveGameTag(db, { ...resolution, evidenceUrls: ["https://127.0.0.1"] }, "Dots"));
  assert.throws(() => resolveGameTag(db, { ...resolution, name: "ผจญภัย" }, "Dots"), /มีแล้ว/);
  resolveGameTag(db, resolution, "Dots");
  assert.equal(db.customTags.length, 1); assert.ok(entry.tags.includes(resolution.name));
  assert.equal(entry.status, "pending"); assert.equal(db.tagRequests[0].resolution?.actor, "Dots");
  assert.equal(db.activity[0].action, "tag.added");
  assert.throws(() => resolveGameTag(db, resolution, "Dots"), /จัดการแล้ว/);
  const next = { ...entry, id: "next-game", tags: [resolution.name] };
  validateGameTags(db, next);
});
test("mapping reuses a tag; rejection never creates a tag; full games do not grow the registry", () => {
  const first = fixture();
  resolveGameTag(first.db, { ...first.resolution, decision: "map", existingTagId: findGameTag(baseGameTags, "RPG")!.id }, "Dots");
  assert.equal(first.db.customTags.length, 0); assert.ok(first.entry.tags.includes("RPG"));
  const second = fixture();
  resolveGameTag(second.db, { ...second.resolution, decision: "reject" }, "Dots");
  assert.equal(second.db.customTags.length, 0); assert.equal(second.db.tagRequests[0].status, "rejected");
  const third = fixture(); third.entry.tags = baseGameTags.slice(0, 20).map(t => t.name);
  assert.throws(() => resolveGameTag(third.db, third.resolution, "Dots"), /20 แท็ก/);
  assert.equal(third.db.customTags.length, 0);
});
test("tag reviewers need explicit permission even when they can write drafts; revoked keys fail", () => {
  const db = seedDatabase();
  const token = manageCatalog(db, { action: "create_agent", revision: 0, name: "Dots test", canWriteDrafts: true })!;
  const agent = authenticateAgent(db, token)!;
  assert.equal(agent.canManageTags, false);
  assert.throws(() => requireTagAgent(db, agent.id), /ไม่มีสิทธิ์/);
  assert.throws(() => createAgentDraft(db, agent.id, "invalid-tags", entryInput.parse({ ...db.entries[0], url: "https://example.com/new", tags: ["Unregistered tag"] })), /ไม่พบแท็ก/);
  manageCatalog(db, { action: "agent_tag_permission", revision: 0, id: agent.id, enabled: true });
  assert.equal(requireTagAgent(db, agent.id).id, agent.id);
  manageCatalog(db, { action: "revoke_agent", revision: 0, id: agent.id });
  assert.throws(() => requireTagAgent(db, agent.id), /ไม่มีสิทธิ์/);
});
