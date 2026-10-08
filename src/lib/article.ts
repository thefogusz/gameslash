import { z } from "zod";

export function publicHttps(value: string) {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".") && !u.hostname.endsWith(".local") && !u.hostname.endsWith(".localhost") && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && !u.hostname.includes(":"); } catch { return false; }
}
export const mediaIdPattern = /^[a-f0-9]{64}\.webp$/;
export const imageUrl = z.string().max(2000).refine(v => /^\/images\/[a-z0-9.-]+$/.test(v) || /^\/api\/media\/[a-f0-9]{64}\.webp$/.test(v) || publicHttps(v), "ใช้ URL ภาพ HTTPS หรือภาพที่อัปโหลด");
const mark = z.discriminatedUnion("type", [
  z.object({ type:z.enum(["bold","italic","strike","underline","code"]) }),
  z.object({ type:z.literal("link"), attrs:z.object({ href:z.string().max(2000).refine(publicHttps, "ลิงก์ต้องเป็น HTTPS สาธารณะ") }) }),
]);
const text = z.object({ type:z.literal("text"), text:z.string().min(1).max(20000), marks:z.array(mark).max(6).optional() });
const inline = z.union([text, z.object({ type:z.literal("hardBreak") })]);
const paragraph = z.object({ type:z.literal("paragraph"), content:z.array(inline).max(1000).optional() });
const item = z.object({ type:z.literal("listItem"), content:z.array(paragraph).min(1).max(20) });
export const articleDocumentSchema = z.object({ type:z.literal("doc"), content:z.array(z.discriminatedUnion("type", [
  paragraph,
  z.object({ type:z.literal("heading"), attrs:z.object({ level:z.union([z.literal(2),z.literal(3)]) }), content:z.array(inline).max(100).optional() }),
  z.object({ type:z.literal("image"), attrs:z.object({ src:imageUrl, alt:z.string().max(300), title:z.string().max(500).nullable().optional() }) }),
  z.object({ type:z.literal("bulletList"), content:z.array(item).min(1).max(100) }),
  z.object({ type:z.literal("orderedList"), attrs:z.object({ start:z.number().int().min(1).max(10000) }).optional(), content:z.array(item).min(1).max(100) }),
  z.object({ type:z.literal("blockquote"), content:z.array(paragraph).min(1).max(50) }),
  z.object({ type:z.literal("codeBlock"), attrs:z.object({ language:z.string().max(40).nullable().optional() }).optional(), content:z.array(text).max(100).optional() }),
  z.object({ type:z.literal("horizontalRule") }),
])).max(200) }).refine(doc => JSON.stringify(doc).length <= 100000, "บทความยาวเกินไป (สูงสุด 100,000 ตัวอักษรรวมรูปแบบ)");
export type ArticleDocument = z.infer<typeof articleDocumentSchema>;
export function textDocument(body: string): ArticleDocument {
  return { type:"doc", content:body.split(/\n\s*\n/).map(text => ({ type:"paragraph", ...(text ? { content:[{ type:"text", text }] } : {}) })) };
}
