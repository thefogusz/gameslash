import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Database } from "./model";
import { manageCatalog } from "./catalog-service";

export const oauthScope = "gameslash";
export const oauthHash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
function refreshSignature(value: string) {
  if ((process.env.SESSION_SECRET?.length || 0) < 32) throw new Error("temporarily_unavailable");
  return createHmac("sha256", process.env.SESSION_SECRET!).update(`oauth-refresh:${value}`).digest("base64url");
}
function refreshToken(agentId: string) {
  const value = `${agentId}.${secret()}`;
  return `${value}.${refreshSignature(value)}`;
}
export function oauthOrigin(request: Request) {
  return process.env.GAMESLASH_OAUTH_ORIGIN || (process.env.VERCEL ? "https://gameslash.vercel.app" : new URL(request.url).origin);
}
export function isChatGPTClient(value: string) {
  return /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]{1,200}\/)?client\.json$/.test(value);
}
export const authorizationSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().max(300).refine(isChatGPTClient),
  redirect_uri: z.string().url().max(2000),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  state: z.string().min(1).max(2000),
  resource: z.string().url().max(2000),
  scope: z.literal(oauthScope).default(oauthScope),
});
export type Authorization = z.infer<typeof authorizationSchema>;
export async function validateAuthorization(params: URLSearchParams, origin: string) {
  const input = authorizationSchema.parse(Object.fromEntries(params));
  if (input.resource !== `${origin}/api/mcp`) throw new Error("invalid_target");
  // Only ChatGPT metadata is fetched; never fetch an arbitrary client URL or follow redirects.
  const response = await fetch(input.client_id, { redirect: "error", signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok) throw new Error("invalid_client");
  const client = z.object({ client_id: z.string(), redirect_uris: z.array(z.string().url()).min(1).max(20) }).parse(await response.json());
  if (client.client_id !== input.client_id || !client.redirect_uris.includes(input.redirect_uri)) throw new Error("invalid_client");
  return input;
}
export function issueAuthorizationCode(db: Database, input: Authorization, canWriteDrafts: boolean, now = Date.now()) {
  db.oauthCodes = db.oauthCodes.filter(code => code.expiresAt > now);
  if (db.oauthCodes.length >= 50) throw new Error("temporarily_unavailable");
  const code = secret();
  db.oauthCodes.push({ hash: oauthHash(code), clientId: input.client_id, redirectUri: input.redirect_uri,
    challenge: input.code_challenge, resource: input.resource, canWriteDrafts, expiresAt: now + 5 * 60_000 });
  return code;
}
export const tokenRequestSchema = z.discriminatedUnion("grant_type", [
  z.object({ grant_type: z.literal("authorization_code"), code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    client_id: z.string().max(300), redirect_uri: z.string().url().max(2000),
    code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/), resource: z.string().url().max(2000) }),
  z.object({ grant_type: z.literal("refresh_token"), refresh_token: z.string().max(200).regex(/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/),
    client_id: z.string().max(300), resource: z.string().url().max(2000), scope: z.literal(oauthScope).optional() }),
]);
export function exchangeOAuthToken(db: Database, input: z.infer<typeof tokenRequestSchema>, now = Date.now()) {
  let agent: Database["agents"][number];
  let grant: Database["oauthGrants"][number];
  let token: string;
  if (input.grant_type === "authorization_code") {
    const code = db.oauthCodes.find(item => item.hash === oauthHash(input.code));
    const challenge = createHash("sha256").update(input.code_verifier).digest("base64url");
    if (!code || code.expiresAt <= now || code.clientId !== input.client_id || code.redirectUri !== input.redirect_uri ||
      code.resource !== input.resource || code.challenge !== challenge) throw new Error("invalid_grant");
    token = manageCatalog(db, { action: "create_agent", revision: db.revision, name: "ChatGPT / Dots",
      canWriteDrafts: code.canWriteDrafts, canManageTags: false, canManageSite: false })!;
    agent = db.agents[db.agents.length - 1];
    grant = { agentId: agent.id, clientId: code.clientId, resource: code.resource, refreshHash: "", accessExpiresAt: 0 };
    db.oauthGrants = db.oauthGrants.filter(item => db.agents.some(a => a.id === item.agentId));
    db.oauthGrants.push(grant);
    db.oauthCodes = db.oauthCodes.filter(item => item !== code);
  } else {
    const [id, nonce, signature] = input.refresh_token.split(".");
    const expected = refreshSignature(`${id}.${nonce}`);
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("invalid_grant");
    const found = db.oauthGrants.find(item => item.agentId === id);
    const active = db.agents.find(item => item.id === found?.agentId && !item.revokedAt && Date.parse(item.expiresAt) > now);
    if (!found || !active || found.clientId !== input.client_id || found.resource !== input.resource) throw new Error("invalid_grant");
    grant = found; agent = active;
    if (grant.refreshHash !== oauthHash(input.refresh_token)) {
      // A valid signed token from an older rotation means this token family was replayed.
      agent.revokedAt = new Date(now).toISOString();
      grant.accessExpiresAt = 0;
      return { error: "invalid_grant" as const };
    }
    token = `gs_${secret()}`;
    agent.tokenHash = oauthHash(token);
  }
  const refresh = refreshToken(agent.id);
  grant.refreshHash = oauthHash(refresh);
  grant.accessExpiresAt = Math.min(now + 3600_000, Date.parse(agent.expiresAt));
  return { access_token: token, token_type: "Bearer", expires_in: Math.floor((grant.accessExpiresAt - now) / 1000),
    refresh_token: refresh, scope: oauthScope };
}
export async function readOAuthForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16_384) { await reader.cancel(); throw new Error("invalid_request"); }
    chunks.push(value);
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new Error("invalid_request");
  return params;
}
export function oauthError(error: unknown) {
  const code = error instanceof Error && ["invalid_grant", "invalid_client", "invalid_target", "temporarily_unavailable"].includes(error.message)
    ? error.message : "invalid_request";
  return Response.json({ error: code }, { status: code === "temporarily_unavailable" ? 503 : 400,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}
