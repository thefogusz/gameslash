import { oauthOrigin, oauthScope } from "@/lib/oauth";
export function GET(request: Request) {
  const origin = oauthOrigin(request);
  return Response.json({ resource: `${origin}/api/mcp`, authorization_servers: [origin],
    scopes_supported: [oauthScope], bearer_methods_supported: ["header"], resource_name: "Gameslash" });
}
