import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
export const cookieName = "gameslash-session";
export function authConfigured() {
  return (
    (process.env.ADMIN_PASSWORD?.length || 0) >= 24 &&
    (process.env.SESSION_SECRET?.length || 0) >= 32
  );
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const sign = (value: string) =>
  createHmac("sha256", process.env.SESSION_SECRET || "")
    .update(value)
    .digest("base64url");
export function createSession() {
  const value = `${Date.now() + 8 * 60 * 60 * 1000}.${randomBytes(18).toString("hex")}`;
  return `${value}.${sign(value)}`;
}
export function validSession(token: string) {
  if (!authConfigured()) return false;
  const [expiry, nonce, signature, ...extra] = token.split(".");
  return (
    !extra.length &&
    !!nonce &&
    !!signature &&
    Number(expiry) > Date.now() &&
    equal(signature, sign(`${expiry}.${nonce}`))
  );
}
export async function isAdmin() {
  return validSession((await cookies()).get(cookieName)?.value || "");
}
export function fingerprint(request: Request) {
  const ip = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for") || "unknown"
    : "local";
  return sign(ip).slice(0, 32);
}
export function checkOrigin(request: Request) {
  let origin: URL;
  try {
    origin = new URL(request.headers.get("origin") || "");
  } catch {
    throw new Error("ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
  }
  const host = request.headers.get("host") || new URL(request.url).host;
  if (
    origin.host !== host ||
    !["https:", "http:"].includes(origin.protocol) ||
    (process.env.VERCEL && origin.protocol !== "https:")
  )
    throw new Error("ไม่อนุญาตคำขอจากเว็บไซต์อื่น");
}
export async function readBody(
  request: Request,
  max = 512000,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("ต้องส่งข้อมูลเป็น JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("ไม่มีข้อมูล");
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > max) {
      await reader.cancel();
      throw new Error("ข้อมูลมีขนาดใหญ่เกินไป");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
