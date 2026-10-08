import { fingerprint } from "@/lib/auth";
import { consumeLimit } from "@/lib/model";
import { exchangeOAuthToken, oauthError, oauthOrigin, readOAuthForm, tokenRequestSchema } from "@/lib/oauth";
import { updateDatabase } from "@/lib/store";
export async function POST(request: Request) {
  try {
    await updateDatabase(db => consumeLimit(db, `oauth-token:${fingerprint(request)}`, 60, 60_000), undefined, false);
    const input = tokenRequestSchema.parse(Object.fromEntries(await readOAuthForm(request)));
    if (input.resource !== `${oauthOrigin(request)}/api/mcp`) throw new Error("invalid_target");
    let tokens!: ReturnType<typeof exchangeOAuthToken>;
    await updateDatabase(db => { tokens = exchangeOAuthToken(db, input); }, undefined, false);
    return Response.json(tokens, { status: "error" in tokens ? 400 : 200, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) { return oauthError(error); }
}
