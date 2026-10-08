import assert from "node:assert/strict";

// Isolated local fixture only: never create test tags on the production registry.
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3033";
assert.equal(new URL(origin).hostname, "127.0.0.1");
assert.ok(process.env.ADMIN_PASSWORD);
const json = { "Content-Type": "application/json", Origin: origin };
const session = await fetch(`${origin}/api/session`, { method: "POST", headers: json, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
assert.equal(session.status, 200);
const headers = { ...json, Cookie: session.headers.get("set-cookie")!.split(";")[0] };
const snapshot = async () => (await fetch(`${origin}/api/manage`, { headers })).json();
async function manage(body: object) {
  const response = await fetch(`${origin}/api/manage`, { method: "POST", headers, body: JSON.stringify({ ...body, revision: (await snapshot()).revision }) });
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
let rpcId = 0;
async function call(token: string, name: string, args: object = {}) {
  const response = await fetch(`${origin}/api/mcp`, { method: "POST", headers: { ...json, Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }) });
  const raw = await response.text(); assert.equal(response.status, 200, raw);
  const data = JSON.parse(raw.startsWith("{") ? raw : raw.split("\n").find(line => line.startsWith("data: "))!.slice(6));
  assert.equal(data.error, undefined); return data.result;
}
const suffix = crypto.randomUUID().slice(0, 8), tag = `Smoke mechanic ${suffix}`;
const game = { kind: "game", title: `Tag smoke ${suffix}`, description: "Local tag review integration test only.", author: "Local test", category: "ผจญภัย", url: `https://example.com/tag-smoke-${suffix}`, tags: ["ผจญภัย"] };
const submit = (body: object) => fetch(`${origin}/api/submit`, { method: "POST", headers: json, body: JSON.stringify(body) });
assert.equal((await submit({ entry: { ...game, tags: ["Unregistered value"] } })).status, 400);
const sent = await submit({ entry: game, tagSuggestions: [{ name: tag, reason: "This new mechanic needs a review against existing tags." }] });
assert.equal(sent.status, 201); const { id } = await sent.json();
const issued = await manage({ action: "create_agent", name: `Tag smoke ${suffix}`, canWriteDrafts: true });
const token = issued.issuedToken;
const agent = issued.agents.find((a: { name: string }) => a.name === `Tag smoke ${suffix}`);
try {
  assert.equal((await call(token, "list_tag_requests")).isError, true);
  assert.equal((await call(token, "get_entry", { id })).isError, true, "Reviewer scope must not leak arbitrary entry access");
  const found = await call(token, "get_game_tags", { query: "ผจญภัย" });
  assert.ok(found.structuredContent.tags.some((t: { name: string }) => t.name === "Adventure"));
  await manage({ action: "agent_tag_permission", id: agent.id, enabled: true });
  const queue = await call(token, "list_tag_requests");
  const item = queue.structuredContent.items.find((i: { game: { id: string } }) => i.game.id === id);
  assert.ok(item); assert.deepEqual(item.game.tags, ["Adventure"]);
  assert.equal("body" in item.game, false);
  const resolution = { requestId: item.request.id, expectedUpdatedAt: item.game.updatedAt, decision: "add", name: tag, reason: "Synthetic local fixture demonstrates evidence-backed tag creation; no real game was inspected.", evidenceUrls: [game.url] };
  assert.equal((await call(token, "resolve_game_tag", { ...resolution, evidenceUrls: [] })).isError, true);
  const result = await call(token, "resolve_game_tag", resolution);
  assert.equal(result.isError, undefined, JSON.stringify(result));
  assert.equal((await call(token, "resolve_game_tag", resolution)).isError, true, "Duplicate resolution must fail");
  const after = await snapshot();
  assert.equal(after.entries.find((e: { id: string }) => e.id === id).status, "pending");
  assert.ok(after.entries.find((e: { id: string }) => e.id === id).tags.includes(tag));
  const publicTags = await (await fetch(`${origin}/api/tags`)).json();
  assert.ok(publicTags.tags.some((t: { name: string }) => t.name === tag));
  assert.equal("tagRequests" in publicTags, false);
  assert.equal(JSON.stringify(publicTags).includes(resolution.reason), false);
  console.log("Public submission → private tag queue → explicit MCP permission → evidence review → registry verified. Game remains pending.");
} finally {
  await manage({ action: "revoke_agent", id: agent.id });
}
