import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { entryInput, publicData, databaseSchema } from "../src/lib/model";
import { manageCatalog, createAgentDraft, editAgentDraft, saveSiteEntry } from "../src/lib/catalog-service";
import { editorialQaInput, recordEditorialQa, requireEditorialQa } from "../src/lib/editorial-qa";
import { qaFixture } from "./qa-fixture";

test("agent submission/publication requires evidence bound to current content and keeps QA private", () => {
  const db = seedDatabase();
  manageCatalog(db, { action: "create_agent", revision: 0, name: "QA fixture", canWriteDrafts: true, canManageSite: true });
  const id = db.agents[0].id;
  const input = entryInput.parse({ kind: "tool", title: "Fixture tool", description: "Verified fixture tool for this isolated test", author: "Fixture", category: "เครื่องมือ", url: "https://example.com/source", sourceUrl: "https://example.com/source" });
  const draft = createAgentDraft(db, id, "qa-fixture-001", input);
  assert.throws(() => editAgentDraft(db, id, draft.id, draft.updatedAt), /QA_REQUIRED/);
  assert.throws(() => saveSiteEntry(db, id, draft.id, draft.updatedAt, input, "published"), /QA_REQUIRED/);
  qaFixture(db, draft);
  assert.doesNotThrow(() => requireEditorialQa(db, draft));
  const changed = editAgentDraft(db, id, draft.id, draft.updatedAt, { ...input, title: "Different news" });
  assert.throws(() => requireEditorialQa(db, changed), /QA_REQUIRED/);
  qaFixture(db, changed);
  const pending = editAgentDraft(db, id, changed.id, changed.updatedAt);
  const published = saveSiteEntry(db, id, pending.id, pending.updatedAt, { ...input, title: changed.title }, "published");
  assert.equal(published.status, "published");
  assert.equal("editorialQa" in publicData(db), false);
  db.editorialQa[draft.id].at = "2020-01-01T00:00:00.000Z";
  assert.throws(() => requireEditorialQa(db, published), /QA_REQUIRED/);
  databaseSchema.parse(db);
});

test("human Console saves and reviews agent entries without MCP QA while agent writes remain gated", () => {
  const db = seedDatabase();
  manageCatalog(db, { action: "create_agent", revision: 0, name: "QA fixture", canWriteDrafts: true, canManageSite: true });
  const agentId = db.agents[0].id;
  const input = entryInput.parse({ kind: "tool", title: "Human reviewed fixture", description: "Manual review in the isolated Console fixture", author: "Fixture", category: "เครื่องมือ", url: "https://example.com/manual" });
  const draft = createAgentDraft(db, agentId, "manual-qa-fixture", input);
  assert.throws(() => saveSiteEntry(db, agentId, draft.id, draft.updatedAt, input, "pending"), /QA_REQUIRED/);
  manageCatalog(db, { action: "entry", revision: db.revision, entry: { ...draft, status: "pending" } });
  const pending = db.entries.find(entry => entry.id === draft.id)!;
  manageCatalog(db, { action: "review", revision: db.revision, id: pending.id, expectedUpdatedAt: pending.updatedAt, decision: "publish", note: "Reviewed by human" });
  const published = db.entries.find(entry => entry.id === draft.id)!;
  assert.equal(published.status, "published");
  assert.throws(() => saveSiteEntry(db, agentId, published.id, published.updatedAt, input, "published"), /QA_REQUIRED/);
  manageCatalog(db, { action: "entry", revision: db.revision, entry: { ...published, title: "Human edited live fixture" } });
  const edited = db.entries.find(entry => entry.id === draft.id)!;
  assert.equal(edited.title, "Human edited live fixture");
  assert.equal(edited.status, "published");
  assert.throws(() => requireEditorialQa(db, edited), /QA_REQUIRED/);
  assert.equal(db.activity[0].actor, "ผู้ดูแล");
});

test("news can be submitted, published and edited without QA while other kinds require evidence", () => {
  const db = seedDatabase();
  manageCatalog(db, { action: "create_agent", revision: 0, name: "News fixture", canWriteDrafts: true, canManageSite: true });
  const agentId = db.agents[0].id;
  const input = entryInput.parse({ kind: "article", title: "News without QA receipt", description: "Isolated news publication fixture", author: "Fixture", category: "ข่าว AI game" });
  const draft = createAgentDraft(db, agentId, "news-qa-exemption", input);
  const pending = editAgentDraft(db, agentId, draft.id, draft.updatedAt);
  const published = saveSiteEntry(db, agentId, pending.id, pending.updatedAt, input, "published");
  const edited = saveSiteEntry(db, agentId, published.id, published.updatedAt, { ...input, title: "Updated news", category: "อัปเดตเครื่องมือ" }, "published");
  assert.equal(edited.status, "published");
  assert.equal(db.editorialQa[edited.id], undefined, "The exemption must not invent QA evidence");
  assert.throws(() => saveSiteEntry(db, agentId, edited.id, edited.updatedAt, { ...input, kind: "tool", url: "https://example.com/converted-tool" }, "published"), /QA_REQUIRED/);
  for (const kind of ["game", "tool", "post"] as const) assert.throws(() => requireEditorialQa(db, { ...edited, kind }), /QA_REQUIRED/);
  db.agents[0].canManageSite = false;
  assert.throws(() => saveSiteEntry(db, agentId, edited.id, edited.updatedAt, input, "published"), /ไม่มีสิทธิ์/);
});

test("QA rejects missing image evidence, stale dates, incomplete links and empty attestations", () => {
  const db = seedDatabase();
  manageCatalog(db, { action: "create_agent", revision: 0, name: "QA fixture", canWriteDrafts: true });
  const at = new Date().toISOString(), agentId = db.agents[0].id;
  const entry = { ...db.entries[0], id: "qa-image", imageAlt: "A real fixture image", body: "Image credit: Author", sourceUrl: "https://example.com/source" };
  const evidence = { claims: [{ claim: "An actual source claim for the fixture", sourceUrl: entry.sourceUrl, checkedAt: at }],
    images: [{ src: entry.image, sourceUrl: "https://example.com/image", credit: "Author", rights: "Editorial use permission from fixture author", inspectedAt: at }],
    links: [entry.url, entry.sourceUrl], render: { method: "browser" as const, checkedAt: at, desktop: true as const, mobile: true as const, notes: "Actual fixture observations on desktop and mobile" } };
  recordEditorialQa(db, entry, agentId, evidence);
  assert.throws(() => recordEditorialQa(db, { ...entry, body: "No visible credit" }, agentId, evidence), /เครดิตภาพต้องมองเห็น/);
  assert.throws(() => recordEditorialQa(db, entry, agentId, { ...evidence, images: [] }), /ทุกใบ/);
  assert.throws(() => recordEditorialQa(db, entry, agentId, { ...evidence, links: [] }), /ลิงก์/);
  assert.throws(() => recordEditorialQa(db, entry, agentId, { ...evidence, render: { ...evidence.render, checkedAt: "2020-01-01T00:00:00.000Z" } }), /7 วัน/);
  assert.equal(editorialQaInput.safeParse({ ...evidence, claims: [], render: { ...evidence.render, notes: "ok" } }).success, false);
});
