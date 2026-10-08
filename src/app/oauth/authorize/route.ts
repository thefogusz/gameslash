import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfigured, checkOrigin, equal, fingerprint } from "@/lib/auth";
import { consumeLimit } from "@/lib/model";
import { issueAuthorizationCode, oauthError, oauthOrigin, readOAuthForm, validateAuthorization, type Authorization } from "@/lib/oauth";
import { updateDatabase } from "@/lib/store";

const csrfCookie = "gameslash-oauth-consent";
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
function consentPage(input: Authorization, csrf: string, error = "") {
  const hidden = Object.entries(input).map(([key, value]) => `<input type="hidden" name="${escape(key)}" value="${escape(value)}">`).join("");
  return new NextResponse(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>เชื่อมต่อ Gameslash</title>
    <style>body{margin:0;background:#111;color:#f5f5f5;font:16px/1.7 system-ui,sans-serif;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;width:min(100%,480px);padding:32px}h1{line-height:1.3}p{color:#bbb}label{display:block;margin:20px 0}input[type=password]{box-sizing:border-box;display:block;width:100%;padding:12px;border:1px solid #777;border-radius:8px;background:#222;color:white;font:inherit}input[type=checkbox]{width:18px;height:18px;vertical-align:middle}button{padding:12px 18px;border:1px solid #777;border-radius:8px;font:inherit;cursor:pointer;background:#242424;color:white}button[value=allow]{background:#cef04a;color:#111;border-color:#cef04a}button:focus-visible,input:focus-visible{outline:3px solid #cef04a;outline-offset:3px}.actions{display:flex;gap:12px;flex-wrap:wrap}.error{color:#ffb6ad}</style></head><body><main>
    <p>GAMESLASH × CHATGPT / DOTS</p><h1>เชื่อมต่อ Gameslash</h1><p>อนุญาตให้ ChatGPT / Dots อ่านรายการสาธารณะและงานของตัวเอง การเชื่อมต่อนี้มีอายุ 90 วัน ยกเลิกได้ใน Console → เอเจนต์</p>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}
    <form method="post" action="/oauth/authorize">${hidden}<input type="hidden" name="csrf" value="${escape(csrf)}">
    <label>รหัสผ่านผู้ดูแล Gameslash<input name="password" type="password" autocomplete="current-password" maxlength="200"></label>
    <label><input name="write" type="checkbox" value="yes" checked> สร้างและแก้ไขฉบับร่างของตัวเอง และส่งตรวจ</label>
    <p>คุณยังเป็นคนยืนยันเผยแพร่ใน Console การเชื่อมต่อนี้ไม่ให้สิทธิ์จัดการเว็บหรือเผยแพร่โดยตรง</p>
    <div class="actions"><button name="decision" value="allow" type="submit">อนุญาตและเชื่อมต่อ</button><button name="decision" value="deny" type="submit">ยกเลิก</button></div></form></main></body></html>`,
    { status: error ? 401 : 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" } });
}
export async function GET(request: Request) {
  try {
    if (!authConfigured()) throw new Error("temporarily_unavailable");
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new Error("invalid_request");
    const input = await validateAuthorization(params, oauthOrigin(request));
    const csrf = randomBytes(32).toString("base64url");
    const response = consentPage(input, csrf);
    response.cookies.set(csrfCookie, csrf, { httpOnly: true, secure: !!process.env.VERCEL,
      sameSite: "strict", path: "/oauth/authorize", maxAge: 600 });
    return response;
  } catch (error) { return oauthError(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!authConfigured()) throw new Error("temporarily_unavailable");
    const params = await readOAuthForm(request);
    const csrf = params.get("csrf") || "";
    const stored = (await cookies()).get(csrfCookie)?.value || "";
    if (!stored || !csrf || !equal(csrf, stored)) throw new Error("invalid_request");
    const input = await validateAuthorization(params, oauthOrigin(request));
    const redirect = new URL(input.redirect_uri);
    redirect.searchParams.set("state", input.state);
    redirect.searchParams.set("iss", oauthOrigin(request));
    if (params.get("decision") === "deny") redirect.searchParams.set("error", "access_denied");
    else {
      if (params.get("decision") !== "allow") throw new Error("invalid_request");
      await updateDatabase(db => consumeLimit(db, `login:${fingerprint(request)}`, 10, 15 * 60_000), undefined, false);
      const password = params.get("password") || "";
      if (password.length > 200 || !equal(password, process.env.ADMIN_PASSWORD!)) return consentPage(input, csrf, "รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่");
      let code = "";
      await updateDatabase(db => { code = issueAuthorizationCode(db, input, params.get("write") === "yes"); }, undefined, false);
      redirect.searchParams.set("code", code);
    }
    const response = NextResponse.redirect(redirect, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(csrfCookie, "", { path: "/oauth/authorize", maxAge: 0 });
    return response;
  } catch (error) { return oauthError(error); }
}
