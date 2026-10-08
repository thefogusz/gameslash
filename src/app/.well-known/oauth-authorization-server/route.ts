import { oauthOrigin, oauthScope } from "@/lib/oauth";
export function GET(request: Request) {
  const origin = oauthOrigin(request);
  return Response.json({ issuer: origin, authorization_response_iss_parameter_supported: true, authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`, response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"], scopes_supported: [oauthScope], client_id_metadata_document_supported: true });
}
