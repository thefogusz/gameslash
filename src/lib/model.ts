import { z } from "zod";
import { gameTagSchema, tagRequestSchema } from "./game-tags";
import { sourceSchema, jobSchema } from "./collection-model";
import { articleDocumentSchema, imageUrl, publicHttps } from "./article";

export const kinds = ["game", "tool", "article", "post"] as const;
export const kindLabels = {
  game: "เกม",
  tool: "เครื่องมือ",
  article: "ข่าว AI game",
  post: "โพสต์เดิม",
};
export function publicUrl(value: string) {
  return publicHttps(value);
}
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || publicUrl(v), "ใช้ลิงก์ HTTPS ของเว็บไซต์สาธารณะ");
export const toolPopularitySchema = z.object({
  score: z.number().int().min(1).max(5),
  reason: z.string().trim().min(20).max(400),
  sources: z.array(z.string().max(2000).refine(publicUrl)).min(1).max(5)
    .refine(values => new Set(values).size === values.length, "แหล่งข้อมูลต้องไม่ซ้ำ"),
  checkedAt: z.iso.date(),
});
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
    image: z.union([z.literal(""), imageUrl]).default(""),
    imageAlt: z.string().max(300).optional(),
    content: articleDocumentSchema.optional(),
    popularity: toolPopularitySchema.nullable().optional(),
    body: z.string().trim().max(20000).default(""),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  })
  .refine(v => !v.popularity || v.kind === "tool", { message: "ดาวความนิยมใช้กับเครื่องมือเท่านั้น", path: ["popularity"] })
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
  spotlights: z.array(z.object({
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(40),
    badge: z.string().trim().min(1).max(40),
    entryIds: z.array(z.string().max(100)).max(5).refine(ids => new Set(ids).size === ids.length, "เลือกเกมไม่ซ้ำกัน"),
  })).max(8).refine(groups => new Set(groups.map(g => g.id)).size === groups.length, "ชุดสไลด์ต้องไม่ซ้ำ").default([]),
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
  canManageTags: z.boolean().default(false),
  canManageSite: z.boolean().default(false),
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
  signal: z.object({
    question: z.string().trim().min(10).max(300),
    topic: z.enum(["3D และฉาก", "ภาพและแอนิเมชัน", "โค้ดและระบบเกม", "AI และเอเจนต์", "เครื่องมือและ repo", "เผยแพร่และประสิทธิภาพ", "อื่น ๆ"]),
    evidenceUrls: z.array(z.string().max(2000).refine(publicUrl)).min(1).max(20).refine(urls => new Set(urls).size === urls.length, "ลิงก์หลักฐานต้องไม่ซ้ำ"),
    solutions: z.array(z.object({
      title: z.string().trim().min(2).max(120),
      url: z.string().max(2000).refine(publicUrl),
      appliesWhen: z.string().trim().min(10).max(500),
      checkedAt: z.iso.date(),
      verification: z.enum(["source-reviewed", "tested"]),
    })).max(8).default([]),
  }).optional(),
});
export const reviewSchema = z.object({
  decision: z.enum(["publish", "return", "reject"]),
  note: z.string().max(1000),
  at: z.iso.datetime(),
});
export const databaseSchema = z.object({
  customTags: z.array(gameTagSchema).max(1000).default([]),
  tagRequests: z.array(tagRequestSchema).max(9000).default([]),
  sources: z.array(sourceSchema).max(20).default([]),
  collectionBudget: z.object({ remaining: z.number().min(0).max(5), verifiedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }).nullable().default(null),
  collectionJobs: z.array(jobSchema).max(100).default([]),
  provenance: z.record(z.string(), collectionContextSchema).default({}),
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
