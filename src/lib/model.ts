import { z } from "zod";

export const kinds = ["game", "tool", "article", "post"] as const;
export const kindLabels = {
  game: "เกม",
  tool: "เครื่องมือ",
  article: "บทความ",
  post: "คอมมูนิตี้",
};
export function publicUrl(value: string) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      host.includes(".") &&
      !host.endsWith(".local") &&
      !host.endsWith(".localhost") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
      !host.includes(":")
    );
  } catch {
    return false;
  }
}
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || publicUrl(v), "ใช้ลิงก์ HTTPS ของเว็บไซต์สาธารณะ");
export const entryInput = z
  .object({
    kind: z.enum(kinds),
    title: z
      .string()
      .trim()
      .min(2, "กรุณาใส่ชื่ออย่างน้อย 2 ตัวอักษร")
      .max(120),
    description: z
      .string()
      .trim()
      .min(10, "คำอธิบายอย่างน้อย 10 ตัวอักษร")
      .max(400),
    author: z.string().trim().min(2).max(100),
    category: z.string().trim().min(1).max(60),
    url: url.default(""),
    sourceUrl: url.default(""),
    image: z
      .string()
      .max(2000)
      .refine(
        (v) => !v || /^\/images\/[a-z0-9.-]+$/.test(v) || publicUrl(v),
        "ลิงก์ภาพไม่ถูกต้อง",
      )
      .default(""),
    body: z.string().trim().max(20000).default(""),
    tags: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  })
  .refine((v) => !["game", "tool"].includes(v.kind) || !!v.url, {
    message: "กรุณาใส่ลิงก์เว็บไซต์ต้นทาง",
    path: ["url"],
  });
export const entrySchema = entryInput.safeExtend({
  id: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  status: z.enum(["draft", "pending", "published", "archived"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Entry = z.infer<typeof entrySchema>;
export type EntryInput = z.infer<typeof entryInput>;
export const sectionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  kind: z.enum(kinds),
  template: z.enum(["shelf", "grid", "list"]),
  category: z.string().max(60).default(""),
  enabled: z.boolean(),
});
export const layoutSchema = z.object({
  tagline: z.string().trim().min(2).max(120),
  categories: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(25)
    .refine((a) => new Set(a).size === a.length, "หมวดหมู่ต้องไม่ซ้ำ"),
  featuredIds: z
    .array(z.string().max(100))
    .max(5)
    .refine((a) => new Set(a).size === a.length),
  sections: z
    .array(sectionSchema)
    .max(20)
    .refine(
      (a) => new Set(a.map((s) => s.id)).size === a.length,
      "ส่วนแสดงผลต้องไม่ซ้ำ",
    ),
});
export type Layout = z.infer<typeof layoutSchema>;
export const agentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  canWriteDrafts: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  revokedAt: z.iso.datetime().nullable(),
});
export const activitySchema = z.object({
  id: z.string().uuid(),
  at: z.iso.datetime(),
  actor: z.string().max(100),
  action: z.string().max(60),
  title: z.string().max(120),
  entryId: z.string().optional(),
});
export const collectionContextSchema = z.object({
  provider: z.string().trim().min(2).max(60),
  runId: z.string().trim().max(100).optional(),
  reason: z.string().trim().min(10).max(1000),
});
export const reviewSchema = z.object({
  decision: z.enum(["publish", "return", "reject"]),
  note: z.string().max(1000),
  at: z.iso.datetime(),
});
export const databaseSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  entries: z.array(entrySchema).max(3000),
  layout: layoutSchema,
  draftLayout: layoutSchema,
  limits: z.record(
    z.string(),
    z.object({ count: z.number(), reset: z.number() }),
  ),
  agents: z.array(agentSchema).max(50).default([]),
  activity: z.array(activitySchema).max(200).default([]),
  ingestions: z.record(z.string(), z.object({
    agentId: z.string().uuid(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    context: collectionContextSchema.optional(),
  })).default({}),
  reviews: z.record(z.string(), reviewSchema).default({}),
});
export type Database = z.infer<typeof databaseSchema>;
export function normalizedUrl(value: string) {
  if (!value) return "";
  const u = new URL(value);
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString().replace(/\/$/, "");
}
export function checkDuplicate(
  entries: Entry[],
  input: Pick<Entry, "url" | "id" | "kind">,
) {
  if (input.kind !== "game" && input.kind !== "tool") return;
  if (
    input.url &&
    entries.some(
      (e) =>
        e.id !== input.id &&
        e.kind === input.kind &&
        e.status !== "archived" &&
        normalizedUrl(e.url) === normalizedUrl(input.url),
    )
  ) {
    throw new Error("มีลิงก์นี้ในระบบแล้ว กรุณาตรวจรายการเดิม");
  }
}
export function consumeLimit(
  db: Database,
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
) {
  for (const k of Object.keys(db.limits))
    if (db.limits[k].reset <= now) delete db.limits[k];
  const item = db.limits[key] ?? { count: 0, reset: now + windowMs };
  if (item.count >= max)
    throw new Error("ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ภายหลัง");
  db.limits[key] = { count: item.count + 1, reset: item.reset };
}
export function publicData(db: Database) {
  return {
    entries: db.entries.filter((e) => e.status === "published"),
    layout: db.layout,
  };
}
export type Catalog = ReturnType<typeof publicData>;
