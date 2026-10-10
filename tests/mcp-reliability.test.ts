import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { manageCatalog } from "../src/lib/catalog-service";
import { readD1, updateD1, D1RequestError } from "../src/lib/d1-store";
import { mcpError } from "../src/lib/mcp-errors";
import { POST } from "../src/app/api/mcp/route";
import { mcpOperatingGuidance } from "../src/lib/editorial-skills";
import { errorResponse } from "../src/lib/http";

test("daily quota errors stop repeated storage calls until UTC midnight and resume afterwards", async context => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 9, 23, 0) });
  const originalFetch = globalThis.fetch;
  const keys = ["GAMESLASH_STORAGE", "GAMESLASH_D1_URL", "GAMESLASH_D1_TOKEN"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.GAMESLASH_STORAGE = "d1";
  process.env.GAMESLASH_D1_URL = "http://127.0.0.1:8799";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return requests === 1 ? Response.json({ code: "D1_QUOTA_EXHAUSTED", resetAt: "2026-10-10T00:00:00.000Z" }, { status: 503 })
      : Response.json({ version: 1, db: seedDatabase() });
  };
  try {
    await assert.rejects(readD1(), error => {
      assert.ok(error instanceof D1RequestError);
      const failure = mcpError(error);
      assert.equal(failure.code, "QUOTA_EXHAUSTED");
      assert.equal(failure.retryable, false);
      assert.equal(failure.outcomeUnknown, false);
      assert.equal(failure.resetAt, "2026-10-10T00:00:00.000Z");
      assert.equal(errorResponse(error).status, 503);
      return true;
    });
    context.mock.timers.tick(30_000);
    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { Authorization: `Bearer gs_${"x".repeat(43)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "3570");
    assert.equal((await response.json()).retryable, false);
    assert.equal(requests, 1, "Even MCP discovery must not repeatedly hit an exhausted D1");
    context.mock.timers.tick(3_570_001);
    assert.deepEqual(await readD1(), seedDatabase());
    assert.equal(requests, 2, "Storage reads must resume after the reset without a process restart");
  } finally {
    globalThis.fetch = originalFetch;
    context.mock.timers.reset();
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});

test("Worker classifies read and write daily quotas without exposing raw database errors", async () => {
  const workerPath = "../cloudflare/worker.ts";
  const { default: worker } = await import(workerPath);
  const originalLog = console.error;
  const logs: string[] = [];
  console.error = message => { logs.push(String(message)); };
  try {
    for (const limit of ["read", "write"]) {
      const env = { D1_SERVICE_TOKEN: "fixture", DB: {
        prepare: () => { throw new Error(`D1_ERROR: Your account has exceeded D1's free tier daily row ${limit} limit. private SQL payload`); },
      } };
      const response = await worker.fetch(new Request("https://fixture/agent-auth", { headers: { Authorization: "Bearer fixture" } }), env);
      assert.equal(response.status, 503);
      const failure = await response.json();
      assert.equal(failure.code, "D1_QUOTA_EXHAUSTED");
      assert.equal(new Date(failure.resetAt).getUTCHours(), 0);
      assert.ok(Date.parse(failure.resetAt) > Date.now());
      assert.ok(!JSON.stringify(failure).includes("private SQL"));
    }
    assert.ok(logs.every(log => !log.includes("private SQL")));
  } finally { console.error = originalLog; }
});

test("MCP discovery reads only current credentials, catalog tools load lazily and isolation is preserved", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["GAMESLASH_STORAGE", "GAMESLASH_D1_URL", "GAMESLASH_D1_TOKEN"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.GAMESLASH_STORAGE = "d1";
  process.env.GAMESLASH_D1_URL = "http://127.0.0.1:8792";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  const db = seedDatabase();
  const token = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Read fixture", canWriteDrafts: false })!;
  let reads = 0, catalogs = 0, unavailable = false;
  let downgradeAgent: string | undefined;
  globalThis.fetch = async url => {
    reads++;
    if (unavailable) return new Response("Unavailable", { status: 503 });
    if (new URL(String(url)).pathname === "/agent-auth") {
      const response = Response.json({ agents: db.agents, oauthGrants: db.oauthGrants });
      if (downgradeAgent) db.agents.find(a => a.id === downgradeAgent)!.canManageSite = false;
      return response;
    }
    catalogs++;
    return Response.json({ version: 1, supportsGameLikes: true, supportsFeedback: true, db });
  };
  let id = 0;
  async function rpc(method: string, params: unknown = {}, authorization = token) {
    const response = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { Authorization: `Bearer ${authorization}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    }));
    const text = await response.text();
    return { response, body: JSON.parse(text.startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6)) };
  }
  try {
    assert.equal((await rpc("tools/list", {}, "invalid")).response.status, 401);
    assert.equal(reads, 0, "Malformed credentials must not trigger a catalog read");
    const initialized = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fixture", version: "1" } });
    assert.equal(initialized.body.result.instructions, mcpOperatingGuidance);
    assert.equal(catalogs, 0, "Connection setup must not load the catalog");
    for (const name of ["get_editorial_skills", "get_article_format"]) {
      reads = 0; catalogs = 0;
      const discovery = await rpc("tools/call", { name, arguments: {} });
      assert.equal(discovery.response.status, 200);
      const result = discovery.body.result.structuredContent;
      const guides = name === "get_article_format" ? result.editorialGuides : result.skills;
      assert.ok(guides.some((guide: { id: string }) => guide.id === "seo-ai-search"));
      assert.equal(reads, 1);
      assert.equal(catalogs, 0);
    }
    reads = 0; catalogs = 0;
    const seo = await rpc("tools/call", { name: "audit_entry_seo", arguments: { entry: {
      kind: "article", title: "Private proposed SEO fixture", description: "Private proposed SEO fixture", author: "Fixture", category: "เทคนิค",
    } } });
    assert.equal(seo.body.result.isError, undefined);
    assert.equal(seo.body.result.structuredContent.report.scope, "submitted-content-only");
    assert.deepEqual(seo.body.result.structuredContent.report.issues.map((issue: { code: string }) => issue.code), ["redundant-description", "missing-body", "missing-source"]);
    assert.equal(reads, 1, "Preflight authenticates a read-only agent without loading the catalog");
    assert.equal(catalogs, 0);
    const invalidSeo = await rpc("tools/call", { name: "audit_entry_seo", arguments: { entry: { kind: "article" } } });
    assert.equal(invalidSeo.body.result.isError, true, "Preflight must validate the same entry schema as saves");
    assert.equal(catalogs, 0);
    const rejectedToken = "gs_" + "x".repeat(43);
    assert.equal((await rpc("tools/list", {}, rejectedToken)).response.status, 401);
    assert.equal(catalogs, 0, "A rejected well-formed token must not load catalog content");
    for (const name of ["get_categories", "search_entries", "get_editorial_skills"]) {
      reads = 0; catalogs = 0;
      const result = await rpc("tools/call", { name, arguments: {} });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.result.isError, undefined);
      assert.equal(reads, name === "get_editorial_skills" ? 1 : 2);
      assert.equal(catalogs, name === "get_editorial_skills" ? 0 : 1);
    }
    db.entries.push({ ...db.entries[0], id: "private-fixture", status: "draft" });
    const hidden = await rpc("tools/call", { name: "get_entry", arguments: { id: "private-fixture" } });
    assert.equal(hidden.body.result.isError, true);
    const denied = await rpc("tools/call", { name: "get_site_state", arguments: {} });
    assert.equal(denied.body.result.isError, true);
    const manager = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Downgrade fixture", canWriteDrafts: true, canManageSite: true })!;
    downgradeAgent = db.agents.find(a => a.name === "Downgrade fixture")!.id;
    db.reviews[db.entries[0].id] = { decision: "publish", note: "Private review", at: new Date().toISOString() };
    const downgraded = await rpc("tools/call", { name: "get_entry", arguments: { id: db.entries[0].id } }, manager);
    assert.equal(downgraded.body.result.structuredContent.review, null, "Permissions changed after authentication must not expose private reviews");
    downgradeAgent = undefined;
    db.agents.find(a => a.name === "Read fixture")!.revokedAt = new Date().toISOString();
    assert.equal((await rpc("tools/list")).response.status, 401, "Revocation must be checked on the next request");
    unavailable = true;
    const failed = await rpc("tools/list");
    assert.equal(failed.response.status, 503);
    assert.equal(failed.response.headers.get("Retry-After"), "5");
    assert.equal(failed.body.code, "SERVICE_UNAVAILABLE");
    assert.equal(failed.body.retryable, true);
    const writer = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "Write fixture", canWriteDrafts: true, canManageSite: true })!;
    let writes = 0;
    globalThis.fetch = async (_url, options) => {
      if (options?.method === "PUT") { writes++; throw new TypeError("lost write response"); }
      if (new URL(String(_url)).pathname === "/agent-auth") return Response.json({ agents: db.agents, oauthGrants: db.oauthGrants });
      return Response.json({ version: 1, supportsGameLikes: true, supportsFeedback: true, db });
    };
    const uncertain = await rpc("tools/call", { name: "save_site_layout", arguments: { revision: db.revision, layout: db.layout, publish: false } }, writer);
    assert.equal(uncertain.body.result.isError, true);
    const failure = JSON.parse(uncertain.body.result.content[0].text);
    assert.equal(failure.code, "OUTCOME_UNKNOWN");
    assert.equal(failure.outcomeUnknown, true);
    assert.equal(failure.retryable, false);
    assert.equal(writes, 1);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});

test("D1 failures distinguish read retries, failed writes and uncertain writes without replaying them", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.GAMESLASH_D1_URL, previousToken = process.env.GAMESLASH_D1_TOKEN;
  process.env.GAMESLASH_D1_URL = "http://127.0.0.1:8792";
  process.env.GAMESLASH_D1_TOKEN = "fixture";
  let writes = 0;
  try {
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    await assert.rejects(readD1(), error => error instanceof D1RequestError && !error.outcomeUnknown);
    globalThis.fetch = async () => new Response("Busy", { status: 429, headers: { "Retry-After": "60" } });
    await assert.rejects(readD1(), error => {
      assert.equal(mcpError(error).retryAfterSeconds, 60);
      return true;
    });
    globalThis.fetch = async (_url, options) => {
      if (options?.method === "PUT") { writes++; throw new TypeError("connection lost after sending"); }
      return Response.json({ version: 1, supportsGameLikes: true, supportsFeedback: true, db: seedDatabase() });
    };
    await assert.rejects(updateD1(db => { db.draftLayout.tagline = "Changed"; }), error => {
      assert.ok(error instanceof D1RequestError);
      assert.equal(mcpError(error).outcomeUnknown, true);
      assert.equal(mcpError(error).retryable, false);
      return true;
    });
    assert.equal(writes, 1, "An uncertain write must never be automatically replayed");
    assert.equal(mcpError(new D1RequestError(401)).retryable, false);
    assert.equal(mcpError(new D1RequestError(401)).code, "STORAGE_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.GAMESLASH_D1_URL; else process.env.GAMESLASH_D1_URL = previousUrl;
    if (previousToken === undefined) delete process.env.GAMESLASH_D1_TOKEN; else process.env.GAMESLASH_D1_TOKEN = previousToken;
  }
});

test("Worker catalog preserves JSON, ordering and authorization without re-parsing stored JSON", async () => {
  const workerPath = "../cloudflare/worker.ts";
  const { default: worker } = await import(workerPath);
  const db = seedDatabase();
  db.entries[0].body = 'Quotes " and braces {} and newline\nทดสอบ';
  const { entries, ...state } = db;
  const env = { D1_SERVICE_TOKEN: "fixture", DB: {
    prepare: (sql: string) => ({ sql }),
    batch: async (_queries: { sql: string }[]): Promise<{ results: Record<string, unknown>[] }[]> => [
      { results: [{ version: 7, data: JSON.stringify(state) }] },
      { results: entries.map(data => ({ data: JSON.stringify(data) })) },
    ],
  } };
  const request = (token: string) => new Request("https://fixture/catalog", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await worker.fetch(request("wrong"), env)).status, 401);
  const originalParse = JSON.parse;
  let parses = 0;
  JSON.parse = (...args) => { parses++; return originalParse(...args); };
  let response: Response;
  try { response = await worker.fetch(request("fixture"), env); } finally { JSON.parse = originalParse; }
  assert.equal(parses, 0);
  assert.equal(response!.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response!.json(), { version: 7, supportsGameLikes: true, supportsFeedback: true, supportsStablePositions: true, db });
  env.DB.batch = async (queries: { sql: string }[]) => {
    assert.equal(queries.length, 2);
    assert.ok(queries[1].sql.includes("gameslash_entry_snapshot"));
    assert.ok(queries[1].sql.includes("SELECT version FROM gameslash_state"));
    assert.ok(queries.every(query => !query.sql.includes("FROM gameslash_entries")), "A matching snapshot must not scan the entry table");
    return [{ results: [{ version: 7, data: JSON.stringify(state) }] }, { results: [{ entries: JSON.stringify(entries) }] }];
  };
  assert.deepEqual(await (await worker.fetch(request("fixture"), env)).json(), { version: 7, supportsGameLikes: true, supportsFeedback: true, supportsStablePositions: true, db });
  env.DB.batch = async () => [{ results: [{ version: 0, data: "{}" }] }, { results: [] }];
  assert.equal((await worker.fetch(request("fixture"), env)).status, 503);
});
