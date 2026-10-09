import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { manageCatalog } from "../src/lib/catalog-service";
import { readD1, updateD1, D1RequestError } from "../src/lib/d1-store";
import { mcpError } from "../src/lib/mcp-errors";
import { POST } from "../src/app/api/mcp/route";
import { mcpOperatingGuidance } from "../src/lib/editorial-skills";

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
  globalThis.fetch = async url => {
    reads++;
    if (unavailable) return new Response("Unavailable", { status: 503 });
    if (new URL(String(url)).pathname === "/agent-auth") return Response.json({ agents: db.agents, oauthGrants: db.oauthGrants });
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
      assert.equal((await rpc("tools/call", { name, arguments: {} })).response.status, 200);
      assert.equal(reads, 1);
      assert.equal(catalogs, 0);
    }
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
    db.agents[0].revokedAt = new Date().toISOString();
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
    assert.equal(failure.code, "SERVICE_UNAVAILABLE");
    assert.equal(failure.outcomeUnknown, true);
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
      assert.equal(mcpError(error).retryable, true);
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
  assert.deepEqual(await response!.json(), { version: 7, supportsGameLikes: true, supportsFeedback: true, db });
  env.DB.batch = async (queries: { sql: string }[]) => {
    assert.equal(queries.length, 2);
    assert.ok(queries[1].sql.includes("gameslash_entry_snapshot"));
    assert.ok(queries[1].sql.includes("SELECT version FROM gameslash_state"));
    assert.ok(queries.every(query => !query.sql.includes("FROM gameslash_entries")), "A matching snapshot must not scan the entry table");
    return [{ results: [{ version: 7, data: JSON.stringify(state) }] }, { results: [{ entries: JSON.stringify(entries) }] }];
  };
  assert.deepEqual(await (await worker.fetch(request("fixture"), env)).json(), { version: 7, supportsGameLikes: true, supportsFeedback: true, db });
  env.DB.batch = async () => [{ results: [{ version: 0, data: "{}" }] }, { results: [] }];
  assert.equal((await worker.fetch(request("fixture"), env)).status, 503);
});
