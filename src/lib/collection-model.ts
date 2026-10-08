import { z } from "zod";
export const facebookGroupUrl = z.string().trim().max(300).regex(/^https:\/\/(?:www\.)?facebook\.com\/groups\/[a-zA-Z0-9.]+\/?$/, "ใส่ลิงก์กลุ่ม Facebook สาธารณะ เช่น https://www.facebook.com/groups/123");
export const sourceSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(80), url: facebookGroupUrl });
export const candidateSchema = z.object({ url: z.string().url().max(2000), text: z.string().max(3000), author: z.string().max(100), time: z.string().max(40) });
export const jobSchema = z.object({
  id: z.string().uuid(), source: sourceSchema, createdAt: z.iso.datetime(),
  limit: z.union([z.literal(10), z.literal(100), z.literal(950)]).default(10),
  status: z.enum(["starting", "unknown", "READY", "RUNNING", "SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTING", "ABORTED"]),
  runId: z.string().regex(/^[a-zA-Z0-9]+$/).max(100).optional(),
  cost: z.number().nonnegative().optional(), message: z.string().max(400).default(""),
  candidates: z.array(candidateSchema).max(950).default([]),
});
export type CollectionJob = z.infer<typeof jobSchema>;
export type CollectionSource = z.infer<typeof sourceSchema>;
export const activeJob = (job: CollectionJob) => ["starting", "unknown", "READY", "RUNNING", "ABORTING"].includes(job.status);
export function collectionMarkdown(job: CollectionJob) {
  const fenced = (value: string) => {
    const longest = Math.max(2, ...(value.match(/^ {0,3}~+/gm) || []).map(line => line.trimStart().length));
    const fence = "~".repeat(longest + 1);
    return `${fence}text\n${value}\n${fence}`;
  };
  return [
    "# ผลการรวบรวมจาก Gameslash",
    fenced(`แหล่งข้อมูล: ${job.source.name}\nลิงก์: ${job.source.url}\nวันที่: ${job.createdAt}\nสถานะ: ${job.status}\nRun ID: ${job.runId || "-"}\nจำนวนโพสต์: ${job.candidates.length}`),
    ...job.candidates.map((post, index) => `## โพสต์ ${index + 1}\n\n${fenced(`ลิงก์: ${post.url}\nผู้เขียน: ${post.author || "-"}\nเวลา: ${post.time || "-"}\n\n${post.text}`)}`),
    "",
  ].join("\n\n");
}
export function reserveFreeBudget(budget: { remaining: number; expiresAt: string } | null, cap: number) {
  if (!budget || Date.parse(budget.expiresAt) <= Date.now()) throw new Error("ต้องตรวจเครดิตฟรีใน Apify และยืนยันวงเงินฝั่งเซิร์ฟเวอร์ก่อนเริ่มงาน");
  if (budget.remaining < cap) throw new Error("วงเงินทดลองใช้ฟรีไม่พอ ระบบไม่เติมเงินหรือต่อวงเงินอัตโนมัติ");
  budget.remaining = Math.round((budget.remaining - cap) * 100) / 100;
}
