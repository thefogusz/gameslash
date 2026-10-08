import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { databaseSchema, entryInput, publicData, type Database } from "../src/lib/model";
import { manageCatalog, authenticateAgent, createAgentDraft, editAgentDraft, agentEntries } from "../src/lib/catalog-service";
const input = () => entryInput.parse({ ...seedDatabase().entries[0], url: "https://example.com/agent-test" });
function key(db: Database, write = true) {
  const token = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Test agent", canWriteDrafts: write })!;
  return { token, agent: authenticateAgent(db, token)! };
}
test("old catalogs default agent metadata; keys are hashed, expire and revoke", () => {
  const { agents: _a, activity: _b, ingestions: _c, ...legacy } = seedDatabase();
  const db = databaseSchema.parse(legacy);
  assert.deepEqual(db.agents, []);
  const { token, agent } = key(db);
  assert.ok(agent);
  assert.equal(JSON.stringify(db).includes(token), false);
  assert.equal(authenticateAgent(db, "bad"), null);
  assert.equal(authenticateAgent(db, token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")), null);
  agent.expiresAt = "2020-01-01T00:00:00.000Z";
  assert.equal(authenticateAgent(db, token), null);
  agent.expiresAt = "2099-01-01T00:00:00.000Z";
  manageCatalog(db, { action: "revoke_agent", revision: db.revision, id: agent.id });
  assert.equal(authenticateAgent(db, token), null);
  assert.throws(() => createAgentDraft(db, agent.id, "request-1", input()), /ไม่มีสิทธิ์/);
  for (const privateField of ["agents", "activity", "ingestions", "limits"]) assert.equal(privateField in publicData(db), false);
});
test("draft retries are idempotent, duplicate URLs and changed request payloads rejected", () => {
  const db = seedDatabase(), { agent } = key(db);
  const draft = createAgentDraft(db, agent.id, "request-1", input());
  const count = db.activity.length;
  assert.deepEqual(createAgentDraft(db, agent.id, "request-1", input()), draft);
  assert.equal(db.activity.length, count);
  assert.equal(db.limits[`agent:${agent.id}`].count, 1);
  assert.throws(() => createAgentDraft(db, agent.id, "request-1", { ...input(), title: "Different" }), /requestId/);
  assert.throws(() => createAgentDraft(db, agent.id, "request-2", input()), /มีลิงก์/);
  assert.equal(draft.status, "draft");
});
test("agents cannot access other drafts, overwrite changes, publish, or modify reviewed work", () => {
  const db = seedDatabase(), first = key(db), second = key(db), reader = key(db, false);
  const draft = createAgentDraft(db, first.agent.id, "request-1", input());
  assert.equal(agentEntries(db, second.agent.id).some(e => e.id === draft.id), false);
  assert.throws(() => editAgentDraft(db, second.agent.id, draft.id, draft.updatedAt, input()), /สร้างเอง/);
  assert.throws(() => createAgentDraft(db, reader.agent.id, "request-1", input()), /ไม่มีสิทธิ์/);
  const changed = editAgentDraft(db, first.agent.id, draft.id, draft.updatedAt, { ...input(), title: "Updated draft" });
  assert.notEqual(changed.updatedAt, draft.updatedAt);
  assert.throws(() => editAgentDraft(db, first.agent.id, draft.id, draft.updatedAt, input()), /ข้อมูลล่าสุด/);
  const pending = editAgentDraft(db, first.agent.id, changed.id, changed.updatedAt);
  assert.equal(pending.status, "pending");
  assert.equal(publicData(db).entries.some(e => e.id === draft.id), false);
  assert.throws(() => editAgentDraft(db, first.agent.id, pending.id, pending.updatedAt, input()), /สร้างเอง/);
  manageCatalog(db, { action: "entry", revision: db.revision, entry: { ...pending, status: "published" } });
  assert.ok(publicData(db).entries.some(e => e.id === draft.id));
  assert.throws(() => editAgentDraft(db, first.agent.id, draft.id, db.entries[0].updatedAt, input()), /สร้างเอง/);
  databaseSchema.parse(db);
});
test("agent write limits and recent activity cap are enforced", () => {
  const db = seedDatabase(), { agent } = key(db);
  db.limits[`agent:${agent.id}`] = { count: 60, reset: Date.now() + 60000 };
  assert.throws(() => createAgentDraft(db, agent.id, "request-1", input()), /บ่อยเกินไป/);
  for (let i = 0; i < 205; i++) manageCatalog(db, { action: "layout", revision: db.revision, layout: db.layout, publish: false });
  assert.equal(db.activity.length, 200);
});
