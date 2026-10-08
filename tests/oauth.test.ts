import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { seedDatabase } from "../src/lib/seed";
import { databaseSchema, publicData } from "../src/lib/model";
import { authenticateAgent, manageCatalog } from "../src/lib/catalog-service";
import { authorizationSchema, exchangeOAuthToken, isChatGPTClient, issueAuthorizationCode, readOAuthForm, validateAuthorization } from "../src/lib/oauth";
import { GET as authorizationPage } from "../src/app/oauth/authorize/route";

const verifier = randomBytes(32).toString("base64url");
process.env.SESSION_SECRET = "oauth-test-session-secret-isolated-123456";
const input = authorizationSchema.parse({ response_type: "code", client_id: "https://chatgpt.com/oauth/client.json",
  redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect", state: "test-state", resource: "https://gameslash.vercel.app/api/mcp",
  code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
function request(code: string) {
  return { grant_type: "authorization_code" as const, code, client_id: input.client_id,
    redirect_uri: input.redirect_uri, code_verifier: verifier, resource: input.resource };
}
test("legacy catalogs default OAuth storage and never expose it publicly", () => {
  const { oauthCodes: _codes, oauthGrants: _grants, ...legacy } = seedDatabase();
  const db = databaseSchema.parse(legacy);
  assert.deepEqual(db.oauthCodes, []);
  assert.deepEqual(db.oauthGrants, []);
  assert.equal("oauthCodes" in publicData(db), false);
  assert.equal("oauthGrants" in publicData(db), false);
});
test("PKCE codes bind client, callback and resource; expire and can only be exchanged once", () => {
  const db = seedDatabase();
  const code = issueAuthorizationCode(db, input, true);
  const valid = request(code);
  for (const changes of [{ code_verifier: randomBytes(32).toString("base64url") }, { client_id: "other" },
    { redirect_uri: "https://evil.example/" }, { resource: "https://evil.example/mcp" }]) {
    assert.throws(() => exchangeOAuthToken(db, { ...valid, ...changes }), /invalid_grant/);
  }
  assert.throws(() => exchangeOAuthToken(db, valid, Date.now() + 300_001), /invalid_grant/);
  const tokens = exchangeOAuthToken(db, valid);
  if ("error" in tokens) throw new Error(tokens.error);
  const agent = authenticateAgent(db, tokens.access_token)!;
  assert.ok(agent.canWriteDrafts);
  assert.equal(authenticateAgent(db, tokens.access_token, "https://other.example/mcp"), null);
  assert.equal(agent.canManageSite, false);
  assert.equal(agent.canManageTags, false);
  assert.equal(tokens.expires_in, 3600);
  assert.throws(() => exchangeOAuthToken(db, valid), /invalid_grant/);
  assert.equal(JSON.stringify(db).includes(code), false);
  assert.equal(JSON.stringify(db).includes(tokens.access_token), false);
  assert.equal(JSON.stringify(db).includes(tokens.refresh_token), false);
  databaseSchema.parse(db);
});
test("OAuth access expires, refresh rotates once, binds client/resource and honors revocation", () => {
  const db = seedDatabase();
  const tokens = exchangeOAuthToken(db, request(issueAuthorizationCode(db, input, false)));
  if ("error" in tokens) throw new Error(tokens.error);
  const agent = authenticateAgent(db, tokens.access_token)!;
  assert.equal(agent.canWriteDrafts, false);
  db.oauthGrants[0].accessExpiresAt = Date.now() - 1;
  assert.equal(authenticateAgent(db, tokens.access_token), null);
  const refresh = { grant_type: "refresh_token" as const, refresh_token: tokens.refresh_token, client_id: input.client_id, resource: input.resource };
  assert.throws(() => exchangeOAuthToken(db, { ...refresh, client_id: "other" }), /invalid_grant/);
  assert.throws(() => exchangeOAuthToken(db, { ...refresh, resource: "https://other.example/mcp" }), /invalid_grant/);
  const rotated = exchangeOAuthToken(db, refresh);
  if ("error" in rotated) throw new Error(rotated.error);
  assert.ok(authenticateAgent(db, rotated.access_token));
  assert.equal(authenticateAgent(db, tokens.access_token), null);
  manageCatalog(db, { action: "revoke_agent", revision: db.revision, id: agent.id });
  assert.equal(authenticateAgent(db, rotated.access_token), null);
  assert.throws(() => exchangeOAuthToken(db, { ...refresh, refresh_token: rotated.refresh_token }), /invalid_grant/);
});
test("reusing a signed refresh token revokes its family; a forged token cannot revoke it", () => {
  const db = seedDatabase();
  const initial = exchangeOAuthToken(db, request(issueAuthorizationCode(db, input, true)));
  if ("error" in initial) throw new Error(initial.error);
  const refresh = { grant_type: "refresh_token" as const, refresh_token: initial.refresh_token, client_id: input.client_id, resource: input.resource };
  const rotated = exchangeOAuthToken(db, refresh);
  if ("error" in rotated) throw new Error(rotated.error);
  assert.throws(() => exchangeOAuthToken(db, { ...refresh, refresh_token: initial.refresh_token.slice(0, -1) + "!" }), /invalid_grant/);
  assert.ok(authenticateAgent(db, rotated.access_token));
  assert.deepEqual(exchangeOAuthToken(db, refresh), { error: "invalid_grant" });
  assert.equal(authenticateAgent(db, rotated.access_token), null);
  assert.throws(() => exchangeOAuthToken(db, { ...refresh, refresh_token: rotated.refresh_token }), /invalid_grant/);
});
test("client metadata can only come from ChatGPT and callbacks must match its document exactly", async () => {
  for (const url of ["https://evil.example/client.json", "http://chatgpt.com/oauth/client.json", "https://chatgpt.com.evil.example/oauth/client.json",
    "https://chatgpt.com/oauth/client.json?url=evil", "https://user@chatgpt.com/oauth/client.json", "https://chatgpt.com:443/oauth/client.json"]) assert.equal(isChatGPTClient(url), false);
  assert.equal(isChatGPTClient("https://chatgpt.com/oauth/callback_123/client.json"), true);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ client_id: input.client_id, redirect_uris: [input.redirect_uri] });
  try {
    assert.deepEqual(await validateAuthorization(new URLSearchParams(input), "https://gameslash.vercel.app"), input);
    await assert.rejects(validateAuthorization(new URLSearchParams({ ...input, redirect_uri: "https://evil.example/" }), "https://gameslash.vercel.app"), /invalid_client/);
    await assert.rejects(validateAuthorization(new URLSearchParams(input), "https://other.example"), /invalid_target/);
  } finally { globalThis.fetch = original; }
});
test("form parser rejects duplicate fields, wrong content type and oversized bodies", async () => {
  const form = (body: string) => new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  await assert.rejects(readOAuthForm(form("code=a&code=b")), /invalid_request/);
  await assert.rejects(readOAuthForm(form("code=" + "x".repeat(16_384))), /invalid_request/);
  await assert.rejects(readOAuthForm(new Request("https://example.com", { method: "POST", body: "code=a" })), /invalid_request/);
});

test("consent CSP permits the ChatGPT callback redirect while keeping other form destinations blocked", async () => {
  const originalFetch = globalThis.fetch;
  const originalPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "isolated-oauth-test-password-123456";
  globalThis.fetch = async () => Response.json({ client_id: input.client_id, redirect_uris: [input.redirect_uri] });
  try {
    const response = await authorizationPage(new Request(`https://gameslash.vercel.app/oauth/authorize?${new URLSearchParams(input)}`));
    assert.equal(response.status, 200);
    const csp = response.headers.get("Content-Security-Policy")!;
    assert.equal(csp.split(";").map(value => value.trim()).find(value => value.startsWith("form-action")), "form-action 'self' https://chatgpt.com");
    assert.ok(csp.includes("frame-ancestors 'none'"));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  }
});
