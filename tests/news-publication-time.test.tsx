import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewsPublicationTime } from "../src/components/news-publication-time";
import { seedDatabase } from "../src/lib/seed";
import { entryInput, entrySchema, type Entry, type Database } from "../src/lib/model";
import { manageCatalog, createAgentDraft, editAgentDraft, saveSiteEntry } from "../src/lib/catalog-service";

const data = () => entryInput.parse({ kind: "article", title: "Publication test", description: "Testing original publication timestamp", author: "Gameslash", category: "ข่าวเกม AI" });
function setup() {
  const db = seedDatabase();
  manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Publication agent", canWriteDrafts: true, canManageSite: true });
  return { db, agent: db.agents.at(-1)! };
}
function save(db: Database, entry: Entry) {
  manageCatalog(db, { action: "entry", revision: db.revision, entry });
  return db.entries.find(e => e.id === entry.id)!;
}

test("draft creation and submission stay undated; approval records first publication", () => {
  const { db, agent } = setup();
  const draft = createAgentDraft(db, agent.id, "publication-review", data());
  assert.equal(draft.publishedAt, undefined);
  const pending = editAgentDraft(db, agent.id, draft.id, draft.updatedAt);
  assert.equal(pending.publishedAt, undefined);
  manageCatalog(db, { action: "review", revision: db.revision, id: pending.id, expectedUpdatedAt: pending.updatedAt, decision: "publish", note: "" });
  const published = db.entries.find(e => e.id === draft.id)!;
  assert.equal(published.publishedAt, published.updatedAt);
  assert.notEqual(published.publishedAt, draft.createdAt);
});

test("direct publication is timestamped and immutable across site edits and republish", () => {
  const { db, agent } = setup();
  const published = saveSiteEntry(db, agent.id, "publication-direct", undefined, data(), "published");
  assert.equal(published.publishedAt, published.updatedAt);
  const edited = saveSiteEntry(db, agent.id, published.id, published.updatedAt, { ...data(), title: "Edited title" }, "published");
  assert.equal(edited.publishedAt, published.publishedAt);
  assert.notEqual(edited.updatedAt, published.updatedAt);
  const draft = save(db, { ...edited, status: "draft", publishedAt: "2000-01-01T00:00:00.000Z" });
  const republished = save(db, { ...draft, status: "published", publishedAt: undefined });
  assert.equal(republished.publishedAt, published.publishedAt);
  const archived = save(db, { ...republished, status: "archived" });
  manageCatalog(db, { action: "restore_entry", revision: db.revision, id: archived.id, expectedUpdatedAt: archived.updatedAt });
  assert.equal(db.entries.find(e => e.id === archived.id)!.publishedAt, published.publishedAt);
});

test("management first publication uses server time, not client dates or draft creation", () => {
  const { db } = setup();
  const draft = save(db, { ...data(), id: "publication-admin", status: "draft", createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z", publishedAt: "2000-01-01T00:00:00.000Z" });
  assert.equal(draft.publishedAt, undefined);
  const published = save(db, { ...draft, status: "published" });
  assert.equal(published.publishedAt, published.updatedAt);
  assert.notEqual(published.publishedAt, draft.createdAt);
});

test("legacy published entries stay unknown through edit, draft, and republish", () => {
  const { db } = setup();
  const legacy = db.entries.find(e => e.status === "published")!;
  assert.equal(entrySchema.parse(legacy).publishedAt, undefined);
  const edited = save(db, { ...legacy, publishedAt: "2000-01-01T00:00:00.000Z" });
  assert.equal(edited.publishedAt, null);
  const draft = save(db, { ...edited, status: "draft", publishedAt: undefined });
  const republished = save(db, { ...draft, status: "published", publishedAt: undefined });
  assert.equal(republished.publishedAt, null);
  assert.equal(renderToStaticMarkup(<NewsPublicationTime publishedAt={republished.publishedAt} />), "");
});

test("legacy archived publication or review evidence never gets a fabricated date", () => {
  for (const source of ["restore", "review", "activity"] as const) {
    const { db } = setup();
    const legacy = db.entries[0];
    legacy.status = source === "restore" ? "archived" : "draft";
    if (source === "restore") legacy.restoreStatus = "published";
    if (source === "review") db.reviews[legacy.id] = { decision: "publish", note: "", at: legacy.updatedAt };
    if (source === "activity") db.activity.push({ id: crypto.randomUUID(), actor: "Test", action: "entry.published", title: legacy.title, entryId: legacy.id, at: legacy.updatedAt });
    assert.equal(save(db, { ...legacy, status: "published" }).publishedAt, null);
  }
});

test("publication UI uses semantic time and explicit Bangkok timezone across midnight", () => {
  const html = renderToStaticMarkup(<NewsPublicationTime publishedAt="2026-10-08T18:05:00.000Z" className="compact" />);
  assert.match(html, /<time/);
  assert.match(html, /dateTime="2026-10-08T18:05:00.000Z"/);
  assert.match(html, /เผยแพร่ 9 ต.ค. 2569 01:05 น. \(เวลาไทย\)/);
  assert.match(html, /news-publication-time compact/);
  assert.equal(renderToStaticMarkup(<NewsPublicationTime publishedAt="2026-10-09T01:05:00+07:00" />), renderToStaticMarkup(<NewsPublicationTime publishedAt="2026-10-08T18:05:00Z" />));
});

test("invalid and absent publication values are hidden and schema rejects invalid dates", () => {
  for (const publishedAt of [undefined, null, "", "bad", "2026-10-09", "2026-10-09T12:00:00", "2026-02-30T00:00:00Z", "2026-10-09T25:00:00Z", "2026-10-09T12:00:00+99:00"]) {
    assert.equal(renderToStaticMarkup(<NewsPublicationTime publishedAt={publishedAt} />), "", String(publishedAt));
    if (publishedAt != null) assert.equal(entrySchema.safeParse({ ...seedDatabase().entries[0], publishedAt }).success, false);
  }
});

test("verified receipts display original time only on exact identity/evidence match", async () => {
  const { newsPublicationAt } = await import("../src/lib/news-publication");
  const { default: receipts } = await import("../src/lib/news-publication-receipts.json");
  assert.equal(receipts.entries.length, 10);
  assert.match(receipts.evidenceSha256, /^[a-f0-9]{64}$/);
  for (const receipt of receipts.entries) {
    const entry = { ...data(), id: receipt.id, sourceUrl: receipt.expectedSourceUrl, createdAt: receipt.expectedCreatedAt };
    assert.equal(newsPublicationAt(entry), receipt.publishedAt);
    assert.equal(newsPublicationAt({ ...entry, publishedAt: null }), receipt.publishedAt);
    assert.equal(newsPublicationAt({ ...entry, publishedAt: "2026-10-01T12:00:00Z" }), "2026-10-01T12:00:00Z");
    assert.equal(newsPublicationAt({ ...entry, id: entry.id + "-copy" }), undefined);
    assert.equal(newsPublicationAt({ ...entry, kind: "game" }), undefined);
    assert.equal(newsPublicationAt({ ...entry, createdAt: "2026-10-01T12:00:00Z" }), undefined);
    assert.equal(newsPublicationAt({ ...entry, sourceUrl: "https://example.com/other-source" }), undefined);
    const edited = { ...entry, title: "Edited article title", description: "New article wording", image: "https://example.com/new.jpg", updatedAt: "2026-11-01T00:00:00Z" };
    assert.equal(newsPublicationAt(edited), receipt.publishedAt);
  }
  assert.equal(newsPublicationAt({ ...data(), id: "unknown-legacy", createdAt: "2026-10-09T00:22:31.553Z", publishedAt: null }), undefined);
});
