import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3020";
assert.ok(process.env.ADMIN_PASSWORD, "Load local environment first");
const json = { "Content-Type": "application/json", Origin: origin };
const login = await fetch(`${origin}/api/session`, { method: "POST", headers: json, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const headers = { ...json, Cookie: login.headers.get("set-cookie")!.split(";")[0] };
async function snapshot() { return (await fetch(`${origin}/api/manage`, { headers })).json(); }
async function manage(body: Record<string, unknown>) {
  const before = await snapshot();
  const response = await fetch(`${origin}/api/manage`, { method: "POST", headers, body: JSON.stringify({ ...body, revision: before.revision }) });
  assert.equal(response.status, 200);
  return response.json();
}
let rpcId = 0;
async function rpc(token: string, method: string, params: unknown = {}, protocol = "2025-11-25") {
  const response = await fetch(`${origin}/api/mcp`, { method: "POST", headers: {
    ...json, Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}`, "MCP-Protocol-Version": protocol,
  }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  const value = text.startsWith("{") ? JSON.parse(text) : JSON.parse(text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
  assert.equal(value.error, undefined, JSON.stringify(value.error));
  return value.result;
}
const call = (token: string, name: string, args: unknown = {}) => rpc(token, "tools/call", { name, arguments: args });
const agentIds: string[] = [];
const entryIds: string[] = [];
try {
  assert.equal((await fetch(`${origin}/api/mcp`, { method: "POST", headers: json, body: "{}" })).status, 401);
  async function issue(write: boolean) {
    const name = `MCP smoke ${crypto.randomUUID()}`;
    const issued = await manage({ action: "create_agent", name, canWriteDrafts: write });
    agentIds.push(issued.agents.find((a: { name: string }) => a.name === name).id);
    assert.ok(issued.issuedToken);
    assert.equal(issued.agents.some((a: object) => "tokenHash" in a), false);
    return issued.issuedToken as string;
  }
  const token = await issue(true), reader = await issue(false);
  assert.equal(JSON.stringify(await snapshot()).includes(token), false);
  const initialized = await rpc(token, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "gameslash-test", version: "1.0.0" } });
  assert.ok(initialized.serverInfo);
  assert.equal((await rpc(token, "tools/list")).tools.length, 8);
  assert.equal((await call(reader, "list_collections")).isError, true);
  assert.ok(Array.isArray((await call(token, "list_collections")).structuredContent.jobs));
  assert.ok((await call(token, "get_categories")).structuredContent.categories.length);
  const entry = { kind: "game", title: "MCP local verification", description: "Private temporary entry for integration testing.", author: "Smoke test", category: "ปริศนา", url: `https://example.com/${crypto.randomUUID()}`, sourceUrl: "https://example.com/source" };
  const requestId = crypto.randomUUID();
  const context = { provider: "Apify", runId: "local-fixture", reason: "Local integration fixture, no external API called." };
  const created = await call(token, "create_draft", { requestId, entry, context });
  assert.equal(created.isError, undefined, JSON.stringify(created.content));
  const draft = created.structuredContent.entry;
  entryIds.push(draft.id);
  assert.equal(draft.status, "draft");
  assert.equal((await call(token, "create_draft", { requestId, entry, context })).structuredContent.entry.id, draft.id);
  assert.equal((await call(token, "create_draft", { requestId, entry: { ...entry, title: "Different input" } })).isError, true);
  assert.equal((await call(reader, "get_entry", { id: draft.id })).isError, true);
  assert.equal((await call(reader, "create_draft", { requestId: crypto.randomUUID(), entry })).isError, true);
  const updated = await call(token, "update_draft", { id: draft.id, expectedUpdatedAt: draft.updatedAt, entry: { ...entry, title: "Updated verification" } });
  assert.equal(updated.isError, undefined);
  assert.equal((await call(token, "update_draft", { id: draft.id, expectedUpdatedAt: draft.updatedAt, entry })).isError, true);
  const review = await call(token, "submit_for_review", { id: draft.id, expectedUpdatedAt: updated.structuredContent.entry.updatedAt });
  assert.equal(review.structuredContent.entry.status, "pending");
  assert.equal((await snapshot()).submissions[draft.id].context.provider, "Apify");
  await manage({ action: "review", id: draft.id, expectedUpdatedAt: review.structuredContent.entry.updatedAt, decision: "return", note: "Please verify the source" });
  const feedback = (await call(token, "get_entry", { id: draft.id })).structuredContent;
  assert.equal(feedback.review.note, "Please verify the source");
  assert.equal(feedback.entry.status, "draft");
  const own = (await call(token, "search_entries", { ownedOnly: true, status: "draft" })).structuredContent;
  assert.ok(own.items.some((e: {id:string}) => e.id === draft.id));
  const again = (await call(token, "submit_for_review", { id: draft.id, expectedUpdatedAt: feedback.entry.updatedAt })).structuredContent.entry;
  await manage({ action: "review", id: draft.id, expectedUpdatedAt: again.updatedAt, decision: "publish", note: "Private review note" });
  assert.equal((await call(reader, "get_entry", { id: draft.id })).structuredContent.review, null);
  assert.equal((await (await fetch(`${origin}/item/${draft.id}`)).text()).includes("Private review note"), false);
  await manage({ action: "entry", entry: { ...again, status: "archived" } });
  assert.equal((await fetch(`${origin}/item/${draft.id}`)).status, 404);
  const forbidden = await fetch(`${origin}/api/mcp`, { method: "POST", headers: { ...json, Authorization: `Bearer ${token}`, Origin: "https://foreign.test" }, body: "{}" });
  assert.equal(forbidden.status, 400);
  await manage({ action: "revoke_agent", id: agentIds[0] });
  assert.equal((await fetch(`${origin}/api/mcp`, { method: "POST", headers: { ...json, Authorization: `Bearer ${token}` }, body: "{}" })).status, 401);
  console.log("PASS: MCP tools, draft ownership, source context, private review feedback, return/resubmit/publish, idempotency, permissions and revocation.");
} finally {
  for (const id of entryIds) {
    const entry = (await snapshot()).entries.find((e: { id: string }) => e.id === id);
    if (entry) await manage({ action: "entry", entry: { ...entry, status: "archived" } });
  }
  for (const id of agentIds) await manage({ action: "revoke_agent", id });
  await fetch(`${origin}/api/session`, { method: "DELETE", headers });
}
