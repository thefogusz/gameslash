import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { readD1, readD1AgentAuth, readD1Likes, readD1Notifications, readD1Tags, initializeD1, updateD1, updateD1Queued, readD1Operation, reserveD1Image, D1RequestError } from "../src/lib/d1-store";
import { manageCatalog, createAgentDraft, agentDraftId } from "../src/lib/catalog-service";
import { entryInput } from "../src/lib/model";
import { catalogChunkCharacters } from "../src/lib/d1-protocol";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { saveImage, readImage } from "../src/lib/media";
import { mcpError } from "../src/lib/mcp-errors";
import { draftNotifications } from "../src/lib/notifications";
import { publicData } from "../src/lib/model";
import { ConflictError } from "../src/lib/postgres-store";
import { jobSchema } from "../src/lib/collection-model";
import { changeGameLikes, gameLikeCounts } from "../src/lib/game-likes";
import { POST } from "../src/app/api/mcp/route";

test("D1 migration, concurrent CAS, rollback, ordering and private access", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  const url = new URL(process.env.GAMESLASH_TEST_D1_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Only an isolated local D1 is allowed");
  process.env.GAMESLASH_D1_URL = url.origin;
  process.env.GAMESLASH_D1_TOKEN = process.env.GAMESLASH_TEST_D1_TOKEN;
  assert.equal((await fetch(new URL("/catalog", url))).status, 401);
  const seed = seedDatabase();
  seed.feedback.push({ id: crypto.randomUUID(), message: "Private D1 feedback", page: "/games", image: "", status: "open", createdAt: new Date().toISOString() });
  seed.collectionJobs.push(jobSchema.parse({ id: crypto.randomUUID(), source: { id: crypto.randomUUID(), name: "Stored posts", url: "https://www.facebook.com/groups/123" }, createdAt: new Date().toISOString(), status: "SUCCEEDED", runId: "fixtureRun", candidates: [{ url: "https://example.com/post", text: "Original source text", author: "Creator", time: "2026-10-09" }] }));
  await initializeD1(seed);
  assert.deepEqual(await readD1(), seed);
  assert.deepEqual(await readD1AgentAuth(), { agents: seed.agents, oauthGrants: seed.oauthGrants });
  assert.deepEqual((await readD1(seed.entries[0].id)).entries, [seed.entries[0]]);
  assert.deepEqual((await readD1("missing-entry")).entries, []);
  for (const path of ["/agent-auth", "/likes?visitor=" + "a".repeat(64), "/catalog?entryId=ai-dungeon"])
    assert.equal((await fetch(new URL(path, url))).status, 401);
  const visitor = "a".repeat(64);
  await updateD1(db => changeGameLikes(db, visitor, { id: "ai-dungeon", liked: true }, "test"), undefined, false);
  await updateD1(db => changeGameLikes(db, visitor, { id: "ai-dungeon", liked: true }, "test"), undefined, false);
  assert.equal(gameLikeCounts(await readD1())["ai-dungeon"], 1);
  assert.deepEqual(await readD1Likes(visitor), ["ai-dungeon"]);
  assert.deepEqual(await readD1Likes("b".repeat(64)), []);
  const invalidVisitor = await fetch(new URL("/likes?visitor=x", url), { headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` } });
  assert.equal(invalidVisitor.status, 400);
  assert.equal((await readD1()).revision, seed.revision);
  await assert.rejects(initializeD1(seed), ConflictError);
  const concurrent = await Promise.allSettled(["first draft", "second draft"].map(tagline =>
    updateD1(db => { db.draftLayout.tagline = tagline; }, seed.revision)));
  assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
  const rejected = concurrent.find(result => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
  const before = await readD1();
  assert.deepEqual(publicData(before), publicData(seed));
  await assert.rejects(updateD1(db => { db.layout.categories = []; }));
  await assert.rejects(updateD1(db => { db.entries.push(db.entries[0]); }), /Duplicate/);
  assert.deepEqual(await readD1(), before);
  const prepended = await updateD1(db => { db.entries.unshift({ ...db.entries[0], id: "stable-rank-draft", status: "draft" }); });
  const rankedSnapshot = await (await fetch(new URL("/catalog", url), {
    headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` },
  })).json();
  assert.equal(rankedSnapshot.supportsStablePositions, true);
  assert.equal(rankedSnapshot.db.entries[0]._d1Position, -1);
  assert.equal(rankedSnapshot.db.entries[1]._d1Position, 0, "Prepending must preserve an existing storage rank");
  assert.deepEqual(await readD1(), prepended);
  await updateD1(db => { db.entries.shift(); });
  await Promise.all(Array.from({ length: 3 }, () => updateD1(db => {
    db.limits.test = { count: (db.limits.test?.count ?? 0) + 1, reset: 9999999999999 };
  }, undefined, false)));
  assert.equal((await readD1()).limits.test.count, 3);
  assert.equal((await readD1()).revision, prepended.revision + 1);
  const changed = await updateD1(db => {
    db.entries.reverse(); db.entries.pop();
    db.entries[0].title = "SQL punctuation ' ; --";
    db.entries.unshift({ ...db.entries[0], id: "new-draft", status: "draft" });
  });
  assert.deepEqual(await readD1(), changed);
  assert.deepEqual(await readD1Notifications(), draftNotifications(changed.entries));
  // Invalid input must not partially change the catalog.
  const request = await fetch(new URL("/catalog", url), {
    headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` },
  });
  const { version } = await request.json();
  const { entries, ...state } = changed;
  const malformed = await fetch(new URL("/catalog", url), {
    method: "PUT", headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: version, state, changed: [{ position: 0, data: { ...entries[0], title: "x" } }], deleted: [] }),
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await readD1(), changed);
  const { entries: _entries, gameLikes: _likes, feedback: _feedback, ...legacyState } = changed;
  const legacyWrite = await fetch(new URL("/catalog", url), {
    method: "PUT", headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expectedVersion: version, state: legacyState, changed: [], deleted: [] }),
  });
  assert.equal(legacyWrite.status, 200);
  assert.deepEqual(await readD1(), changed, "An older app must not wipe existing game likes or feedback");
  const large = await updateD1(db => {
    db.entries = Array.from({ length: 160 }, (_, i) => ({
      ...db.entries[0], id: `large-fixture-${i}`, body: "x".repeat(15_000),
    }));
  });
  assert.ok(Buffer.byteLength(JSON.stringify(large)) > 1_800_000);
  const originalFetch = globalThis.fetch;
  let pages = 0, maxPageBytes = 0;
  globalThis.fetch = async (request, options) => {
    const response = await originalFetch(request, options);
    const path = new URL(String(request));
    if (path.pathname === "/catalog") assert.equal(path.searchParams.get("format"), "chunks", "Large reads must never fall back to one legacy payload");
    if (path.pathname === "/catalog-page") { pages++; maxPageBytes = Math.max(maxPageBytes, (await response.clone().arrayBuffer()).byteLength); }
    return response;
  };
  try { assert.deepEqual(await readD1(), large); } finally { globalThis.fetch = originalFetch; }
  assert.ok(pages > 0);
  assert.ok(maxPageBytes <= 128 * 1024);
});

test("three agents serialize scoped writes and recover atomic receipts after a lost response", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  const url = new URL(process.env.GAMESLASH_TEST_D1_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  process.env.GAMESLASH_D1_URL = url.origin;
  process.env.GAMESLASH_D1_TOKEN = process.env.GAMESLASH_TEST_D1_TOKEN;
  const seeded = await updateD1(db => {
    db.entries = Array.from({ length: 160 }, (_, i) => ({ ...seedDatabase().entries[0], id: `queue-fixture-${i}`, url: `https://example.com/existing/${i}`, body: "x".repeat(15_000) }));
    for (let i = 0; i < 3; i++) manageCatalog(db, { action: "create_agent", revision: db.revision, name: `Queue fixture ${i}`, canWriteDrafts: true });
  });
  const agents = seeded.agents.slice(-3);
  const originalFetch = globalThis.fetch;
  const changedCounts: number[] = [];
  let catalogReadBytes = 0;
  globalThis.fetch = async (request, options) => {
    const response = await originalFetch(request, options);
    const path = new URL(String(request)).pathname;
    if (path === "/catalog" && options?.method === "PUT") changedCounts.push(JSON.parse(String(options.body)).changed.length);
    if (path === "/catalog-chunk") catalogReadBytes += (await response.clone().arrayBuffer()).byteLength;
    return response;
  };
  const contexts = agents.map((agent, i) => ({ agentId: agent.id, tool: "create_draft", requestId: "shared-request-id", inputHash: String(i + 1).repeat(64) }));
  try {
    await Promise.all(contexts.map((context, i) => updateD1Queued(db => {
      createAgentDraft(db, context.agentId, context.requestId, entryInput.parse({ ...seedDatabase().entries[0], image: "", url: `https://example.com/new/${i}` }));
    }, undefined, agentDraftId(context.agentId, context.requestId), context)));
    assert.deepEqual(changedCounts, [1, 1, 1], "Metadata shells must never overwrite untouched entries");
    assert.ok(catalogReadBytes < 500_000, "Three writes must not download the 2.4 MB catalog three times");
    assert.ok((await readD1("queue-fixture-100")).entries[0].body.length === 15_000);
    for (const context of contexts) {
      const receipt = await readD1Operation(context.agentId, context.tool, context.requestId);
      assert.equal(receipt?.status, "succeeded");
      assert.equal(JSON.parse(receipt!.result!).entryId, agentDraftId(context.agentId, context.requestId));
    }
    assert.equal(await readD1Operation(agents[1].id, "create_draft", "another-agents-job"), null);
    const context = { ...contexts[0], requestId: "lost-reply-request", inputHash: "a".repeat(64) };
    const id = agentDraftId(context.agentId, context.requestId);
    let lose = true;
    globalThis.fetch = async (request, options) => {
      const response = await originalFetch(request, options);
      if (lose && new URL(String(request)).pathname === "/catalog" && options?.method === "PUT") { lose = false; throw new Error("Lost committed response"); }
      return response;
    };
    const write = () => updateD1Queued(db => { createAgentDraft(db, context.agentId, context.requestId, entryInput.parse({ ...seedDatabase().entries[0], image: "", url: "https://example.com/lost" })); }, undefined, id, context);
    await assert.rejects(write(), error => error instanceof D1RequestError && error.outcomeUnknown);
    assert.equal((await readD1Operation(context.agentId, context.tool, context.requestId))?.status, "succeeded");
    const recovered = await write();
    assert.equal(recovered.entries[0].id, id);
    assert.equal(recovered.limits[`agent:${context.agentId}`].count, 2, "Lost reply recovery cannot double-charge the draft");
    await assert.rejects(updateD1Queued(() => {}, undefined, id, { ...context, inputHash: "b".repeat(64) }), ConflictError);
    await assert.rejects(updateD1Queued(db => { db.entries[1].title = "Forbidden shell edit"; }, undefined, id), /another entry/);
    await assert.rejects(updateD1Queued(db => { db.entries.reverse(); }, undefined, id), /reorder/);
    console.log(JSON.stringify({ threeAgentWrites: true, catalogReadBytes, untouchedContentPreserved: true, lostReplyReceipt: true }));
  } finally { globalThis.fetch = originalFetch; }
});

test("three MCP clients follow QA gates, private receipts and a staged live edit", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  process.env.GAMESLASH_STORAGE = "d1";
  const tokens: string[] = [];
  await updateD1(db => {
    db.entries = seedDatabase().entries;
    for (let i = 0; i < 3; i++) tokens.push(manageCatalog(db, { action: "create_agent", revision: db.revision, name: `MCP fixture ${i}`, canWriteDrafts: true, canManageSite: i === 0 })!);
  });
  let rpcId = 0;
  const call = async (index: number, name: string, args: unknown) => {
    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${tokens[index]}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
    }));
    assert.equal(response.status, 200);
    const text = await response.text();
    return JSON.parse(text.startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6)).result;
  };
  const inputs = tokens.map((_, i) => entryInput.parse({ kind: "article", title: `Isolated MCP news ${i}`, description: "Isolated news fixture with public original source", author: "Fixture author", category: "ข่าว", sourceUrl: `https://example.com/source/${i}` }));
  try {
    const drafts = await Promise.all(inputs.map((entry, i) => call(i, "create_draft", { requestId: `mcp-news-request-${i}`, entry })));
    assert.ok(drafts.every(result => !result.isError));
    const entry = drafts[0].structuredContent.entry;
    const rejected = await call(0, "submit_for_review", { id: entry.id, expectedUpdatedAt: entry.updatedAt, operationId: "mcp-rejected-submit" });
    assert.equal(JSON.parse(rejected.content[0].text).code, "QA_REQUIRED");
    const at = new Date().toISOString();
    const qa = { claims: [{ claim: "Original announcement verified for this isolated fixture", sourceUrl: inputs[0].sourceUrl, checkedAt: at }], images: [], noImageReason: "No suitable fixture image is needed for this test", links: [inputs[0].sourceUrl], render: { method: "client-preview", checkedAt: at, desktop: true, mobile: true, notes: "Fixture desktop and mobile layout inspected in the isolated client" } };
    assert.equal((await call(1, "record_entry_qa", { id: entry.id, expectedUpdatedAt: entry.updatedAt, qa })).isError, true);
    const checked = await call(0, "record_entry_qa", { id: entry.id, expectedUpdatedAt: entry.updatedAt, qa, operationId: "mcp-qa-request-001" });
    assert.equal(checked.structuredContent.recorded, true);
    const pending = (await call(0, "submit_for_review", { id: entry.id, expectedUpdatedAt: entry.updatedAt, operationId: "mcp-submit-request-001" })).structuredContent.entry;
    assert.equal(pending.status, "pending");
    const state = (await call(0, "get_site_state", {})).structuredContent;
    const published = (await call(0, "review_site_entry", { id: entry.id, revision: state.revision, expectedUpdatedAt: pending.updatedAt, decision: "publish", operationId: "mcp-publish-request-001" })).structuredContent.entry;
    assert.equal(published.status, "published");
    assert.equal((await call(1, "get_entry", { id: entry.id })).structuredContent.qa, null, "Published content never exposes private QA to another writer");
    assert.equal((await call(1, "get_operation_status", { tool: "record_entry_qa", operationId: "mcp-qa-request-001" })).structuredContent.operation, null);
    const receipt = (await call(0, "get_operation_status", { tool: "review_site_entry", operationId: "mcp-publish-request-001" })).structuredContent.operation;
    assert.equal(receipt.status, "succeeded");
    const replacement = { ...inputs[0], title: "Edited isolated MCP news" };
    const unverified = await call(0, "save_site_entry", { id: published.id, revision: (await call(0, "get_site_state", {})).structuredContent.revision, expectedUpdatedAt: published.updatedAt, status: "published", entry: replacement, operationId: "mcp-unverified-live-edit" });
    assert.equal(JSON.parse(unverified.content[0].text).code, "QA_REQUIRED");
    assert.equal((await call(0, "get_entry", { id: published.id })).structuredContent.entry.title, published.title);
    assert.equal((await call(0, "record_entry_qa", { id: published.id, expectedUpdatedAt: published.updatedAt, proposedEntry: replacement, qa, operationId: "mcp-proposed-qa-001" })).isError, undefined);
    const editState = (await call(0, "get_site_state", {})).structuredContent;
    const edited = await call(0, "save_site_entry", { id: published.id, revision: editState.revision, expectedUpdatedAt: published.updatedAt, status: "published", entry: replacement, operationId: "mcp-live-edit-001" });
    assert.equal(edited.structuredContent.entry.title, replacement.title);
    assert.equal(edited.structuredContent.entry.status, "published");
    assert.equal((await call(0, "get_entry", { id: published.id })).structuredContent.qa.current, true);
  } finally { delete process.env.GAMESLASH_STORAGE; }
});

test("bounded catalog chunks reconstruct Unicode and restart when the storage version changes", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  const url = new URL(process.env.GAMESLASH_TEST_D1_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  process.env.GAMESLASH_D1_URL = url.origin;
  process.env.GAMESLASH_D1_TOKEN = process.env.GAMESLASH_TEST_D1_TOKEN;
  const db = await updateD1(db => {
    db.entries = Array.from({ length: 50 }, (_, i) => ({ ...db.entries[0], id: `unicode-${i}`, body: 'ก😀\\"\n'.repeat(1000) }));
  });
  const originalFetch = globalThis.fetch;
  let maxBytes = 0, chunks = 0, manifests = 0, changed = false;
  try {
    globalThis.fetch = async (target, init) => {
      const requestUrl = new URL(String(target));
      const response = await originalFetch(target, init);
      if (requestUrl.searchParams.get("format") === "chunks") manifests++;
      if (requestUrl.pathname === "/catalog-chunk" && response.ok) {
        const text = await response.clone().text();
        maxBytes = Math.max(maxBytes, Buffer.byteLength(text)); chunks++;
        assert.ok(Buffer.byteLength(text) <= catalogChunkCharacters * 4);
        if (!changed) {
          changed = true;
          await updateD1(current => { current.layout.tagline = "Changed during chunk read"; });
        }
      }
      return response;
    };
    const read = await readD1();
    assert.equal(read.layout.tagline, "Changed during chunk read");
    assert.deepEqual(read.entries, db.entries);
    assert.ok(manifests >= 3, "A conflicting read restarts from fresh metadata");
    assert.ok(chunks > 10);
    assert.deepEqual(await readD1Tags(), db.customTags);
    assert.deepEqual((await readD1("unicode-1")).entries, [db.entries[1]]);
    assert.deepEqual((await readD1("missing-entry")).entries, []);
  } finally { globalThis.fetch = originalFetch; }
  const headers = { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` };
  const manifest = await (await originalFetch(new URL("/catalog?format=chunks", url), { headers })).json();
  assert.equal((await originalFetch(new URL(`/catalog-chunk?part=state&offset=0&version=${manifest.version - 1}`, url), { headers })).status, 409);
  for (const query of ["part=unknown&offset=0&version=1", "part=state&offset=1&version=1", "part=state&offset=0&version=oops", "part=entries&offset=0&version=1&entryId=INVALID"])
    assert.equal((await originalFetch(new URL(`/catalog-chunk?${query}`, url), { headers })).status, 400);
  assert.equal((await originalFetch(new URL("/catalog-chunk?part=state&offset=0&version=1", url))).status, 401);
  assert.equal((await originalFetch(new URL("/tags", url))).status, 401);
  console.log(JSON.stringify({ isolatedChunkRead: true, maxChunkBytes: maxBytes, chunks, manifests }));
});

test("D1 image reservations survive lost replies and storage failures without double charging", {
  skip: !process.env.GAMESLASH_TEST_D1_URL,
}, async () => {
  const url = new URL(process.env.GAMESLASH_TEST_D1_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  process.env.GAMESLASH_D1_URL = url.origin;
  process.env.GAMESLASH_D1_TOKEN = process.env.GAMESLASH_TEST_D1_TOKEN;
  const agentId = crypto.randomUUID();
  await updateD1(db => {
    db.agents.push({ id: agentId, name: "Image fixture", tokenHash: "a".repeat(64), canWriteDrafts: true, canManageTags: false,
      canManageSite: false, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), revokedAt: null });
  });
  const before = await readD1();
  const originalFetch = globalThis.fetch;
  let reservations = 0;
  try {
    globalThis.fetch = async (target, init) => {
      assert.equal(new URL(String(target)).pathname, "/image-reservation", "Upload counters must never load the catalog");
      assert.ok(Buffer.byteLength(String(init?.body)) < 1024);
      const response = await originalFetch(target, init);
      if (++reservations === 1) { assert.equal(response.status, 200); throw new Error("Lost successful response"); }
      return response;
    };
    await reserveD1Image("a".repeat(64), agentId);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(reservations, 2);
  let db = await readD1();
  assert.equal(db.limits[`media:${agentId}`].count, 1);
  assert.equal(db.limits["media:daily"].count, 1);
  assert.equal(db.revision, before.revision);
  assert.deepEqual(db.entries, before.entries);
  assert.deepEqual(db.collectionJobs, before.collectionJobs);
  assert.deepEqual(db.feedback, before.feedback);
  await Promise.all(Array.from({ length: 3 }, () => reserveD1Image("b".repeat(64), agentId)));
  assert.equal((await readD1()).limits[`media:${agentId}`].count, 2, "Concurrent identical requests charge once");

  const directory = await mkdtemp(path.join(tmpdir(), "d1-image-fixture-"));
  const keys = ["GAMESLASH_STORAGE", "GAMESLASH_DATA_DIR", "GAMESLASH_READ_ONLY", "VERCEL", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.GAMESLASH_STORAGE = "d1";
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
  try {
    const blocked = path.join(directory, "blocked");
    await writeFile(blocked, "fixture");
    process.env.GAMESLASH_DATA_DIR = blocked;
    await assert.rejects(saveImage(bytes, agentId), error => {
      assert.equal(mcpError(error).retryable, true);
      assert.equal(mcpError(error).outcomeUnknown, false);
      return true;
    });
    process.env.GAMESLASH_DATA_DIR = directory;
    const saved = await saveImage(bytes, agentId);
    assert.ok(await readImage(saved.url.split("/").at(-1)!));
    assert.deepEqual(await saveImage(bytes, agentId), saved);
    assert.equal((await readD1()).limits[`media:${agentId}`].count, 3);
    await reserveD1Image("a".repeat(64), agentId, "feedback");
    assert.equal((await readD1()).limits[`feedback:${agentId}`].count, 1);

    await updateD1(db => { db.limits[`media:${agentId}`].count = 40; }, undefined, false);
    db = await readD1();
    await assert.rejects(reserveD1Image("c".repeat(64), agentId), error => error instanceof D1RequestError && error.status === 429);
    assert.deepEqual(await readD1(), db, "A quota rejection must not partially update counters");
    await reserveD1Image("a".repeat(64), agentId);
    assert.deepEqual(await readD1(), db, "Previously reserved images remain retryable at the limit");
    await updateD1(db => {
      db.limits[`media:${agentId}`].reset = Date.now() - 1;
      db.limits["media:daily"].count = 200;
    }, undefined, false);
    db = await readD1();
    await assert.rejects(reserveD1Image("d".repeat(64), agentId), error => error instanceof D1RequestError && error.status === 429);
    assert.deepEqual(await readD1(), db, "Daily rejection must not consume the next hourly window");
    await updateD1(db => {
      db.limits["media:daily"].reset = Date.now() - 1;
      const agent = db.agents.find(agent => agent.id === agentId)!;
      agent.canWriteDrafts = false; agent.canManageSite = true;
    }, undefined, false);
    await reserveD1Image("d".repeat(64), agentId);
    db = await readD1();
    assert.equal(db.limits[`media:${agentId}`].count, 1);
    assert.equal(db.limits["media:daily"].count, 1);
    await updateD1(db => { db.agents.find(agent => agent.id === agentId)!.canManageSite = false; });
    await assert.rejects(reserveD1Image("a".repeat(64), agentId), error => error instanceof D1RequestError && error.status === 403);
    await updateD1(db => {
      const agent = db.agents.find(agent => agent.id === agentId)!;
      agent.canWriteDrafts = true; agent.expiresAt = new Date(Date.now() - 1000).toISOString();
    });
    await assert.rejects(reserveD1Image("a".repeat(64), agentId), error => error instanceof D1RequestError && error.status === 403);
    await updateD1(db => { db.agents.find(agent => agent.id === agentId)!.expiresAt = new Date(Date.now() + 86400000).toISOString(); });
    await updateD1(db => { db.agents.find(agent => agent.id === agentId)!.revokedAt = new Date().toISOString(); });
    await assert.rejects(reserveD1Image("a".repeat(64), agentId), error => error instanceof D1RequestError && error.status === 403);
    process.env.GAMESLASH_READ_ONLY = "true";
    await assert.rejects(saveImage(bytes), /ยังไม่พร้อม/);

    const headers = { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}` };
    for (const body of [{ imageId: "a".repeat(64), namespace: "private" }, { imageId: "bad", namespace: "media" },
      { imageId: "a".repeat(64), namespace: "media", agentId: "invalid" }])
      assert.equal((await originalFetch(new URL("/image-reservation", url), { method: "PUT", headers, body: JSON.stringify(body) })).status, 400);
    assert.equal((await originalFetch(new URL("/image-reservation", url), { method: "PUT", headers, body: " ".repeat(1025) })).status, 413);
    assert.equal((await originalFetch(new URL("/image-reservation", url), { headers })).status, 405);
    assert.equal((await originalFetch(new URL("/image-reservation", url), { method: "PUT", body: "{}" })).status, 401);
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await rm(directory, { recursive: true, force: true });
  }
});
