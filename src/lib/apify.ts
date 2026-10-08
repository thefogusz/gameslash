import { z } from "zod";
import { candidateSchema, facebookGroupUrl } from "./collection-model";
export const APIFY_ACTOR = "2chN8UQcH1CfxLRNE";
export const runCap = (limit: 10 | 100 | 950) => ({ 10: 0.25, 100: 0.75, 950: 4.85 })[limit];
const id = z.string().regex(/^[a-zA-Z0-9]+$/).max(100);
export const apifyRunSchema = z.object({
  id, actId: z.literal(APIFY_ACTOR), defaultDatasetId: id,
  status: z.enum(["READY", "RUNNING", "SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTING", "ABORTED"]),
  usageTotalUsd: z.number().nonnegative().optional(),
});
export function freeCreditBalance(user: unknown, usage: unknown) {
  const account = z.object({ isPaying: z.literal(false), plan: z.object({ id: z.string(), monthlyBasePriceUsd: z.literal(0), monthlyUsageCreditsUsd: z.number().positive() }) }).safeParse(user);
  const credits = z.object({ totalUsageCreditsUsdAfterVolumeDiscount: z.number().nonnegative(), usageCycle: z.object({ startAt: z.iso.datetime(), endAt: z.iso.datetime() }) }).safeParse(usage);
  if (!account.success || !credits.success || account.data.plan.id.toLowerCase() !== "free") throw new Error("ยืนยันบัญชี Free ไม่ได้ จึงไม่เริ่มงานที่ใช้เครดิต");
  if (Date.parse(credits.data.usageCycle.startAt) > Date.now() || Date.parse(credits.data.usageCycle.endAt) <= Date.now()) throw new Error("ข้อมูลรอบเครดิตฟรีไม่เป็นปัจจุบัน กรุณาตรวจ Apify");
  return Math.max(0, account.data.plan.monthlyUsageCreditsUsd - credits.data.totalUsageCreditsUsdAfterVolumeDiscount);
}
export function runInput(url: string, limit: 10 | 100 | 950) {
  return { startUrls: [{ url: facebookGroupUrl.parse(url) }], resultsLimit: limit, viewOption: "CHRONOLOGICAL" };
}
export function extractCandidates(data: unknown) {
  if (!Array.isArray(data)) throw new Error("รูปแบบผลลัพธ์ Apify ไม่ถูกต้อง");
  const seen = new Set<string>();
  return data.slice(0, 950).flatMap(item => {
    const parsed = z.object({ url: z.string(), text: z.string(), time: z.string().optional(), user: z.object({ name: z.string().optional() }).optional() }).safeParse(item);
    if (!parsed.success) return [];
    const post = parsed.data;
    try {
      const url = new URL(post.url);
      if (url.protocol !== "https:" || !["www.facebook.com", "facebook.com", "m.facebook.com"].includes(url.hostname) || url.username || url.password || !post.text.trim()) return [];
      url.hash = ""; for (const key of [...url.searchParams.keys()]) if (/^utm_|^fbclid$/.test(key)) url.searchParams.delete(key);
      if (seen.has(url.href)) return [];
      seen.add(url.href);
      return [candidateSchema.parse({ url: url.href, text: post.text.slice(0, 3000), author: (post.user?.name || "").slice(0, 100), time: (post.time || "").slice(0, 40) })];
    } catch { return []; }
  });
}
export async function apifyRequest(path: string, body?: unknown) {
  if (!process.env.APIFY_TOKEN) throw new Error("ยังไม่ได้เชื่อม Apify กรุณาตั้ง APIFY_TOKEN บนเซิร์ฟเวอร์");
  const response = await fetch(`https://api.apify.com/v2/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN.trim()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Apify ตอบกลับ ${response.status} กรุณาตรวจสิทธิ์และสถานะบัญชี`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Apify ไม่ส่งข้อมูลกลับ");
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 12000000) { await reader.cancel(); throw new Error("ผลลัพธ์ Apify ใหญ่เกินขอบเขตทดลอง"); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function remainingCredits() {
  const [user, usage] = await Promise.all([apifyRequest("users/me"), apifyRequest("users/me/usage/monthly")]);
  return freeCreditBalance(user.data, usage.data);
}
