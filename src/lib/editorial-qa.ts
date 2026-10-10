import { createHash } from "node:crypto";
import { z } from "zod";
import { publicHttps } from "./article";
import type { Database, Entry } from "./model";

const source = z.string().max(2000).refine(publicHttps);
export const editorialQaInput = z.object({
  claims: z.array(z.object({ claim: z.string().trim().min(10).max(500), sourceUrl: source, checkedAt: z.iso.datetime() })).min(1).max(20),
  images: z.array(z.object({ src: z.string().max(2000), sourceUrl: source, credit: z.string().trim().min(2).max(300), rights: z.string().trim().min(10).max(500), inspectedAt: z.iso.datetime() })).max(20),
  noImageReason: z.string().trim().min(10).max(500).optional(),
  links: z.array(source).max(100),
  render: z.object({ method: z.enum(["browser", "client-preview"]), checkedAt: z.iso.datetime(), desktop: z.literal(true), mobile: z.literal(true), notes: z.string().trim().min(20).max(1000) }),
});
export const editorialQaSchema = z.object({ evidence: editorialQaInput.optional(), hash: z.string().regex(/^[a-f0-9]{64}$/), agentId: z.uuid(), at: z.iso.datetime(), basedOnUpdatedAt: z.iso.datetime().optional() });
export function editorialHash(entry: Entry) {
  const { id: _id, status: _status, createdAt: _created, updatedAt: _updated, publishedAt: _published, restoreStatus: _restore, ...content } = entry;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
export function recordEditorialQa(db: Database, entry: Entry, agentId: string, raw: z.infer<typeof editorialQaInput>) {
  const qa = editorialQaInput.parse(raw);
  const images = [ ...(entry.kind === "article" ? [] : entry.image ? [{ src: entry.image, alt: entry.imageAlt, title: "cover" }] : []),
    ...(entry.content?.content.filter(n => n.type === "image").map(n => n.attrs) ?? []) ];
  if (!images.length && entry.image) images.push({ src: entry.image, alt: entry.imageAlt, title: "cover" });
  if (images.length && images.some(image => !image.alt?.trim() || !image.title?.trim())) throw new Error("QA: ภาพต้องมี alt และคำบรรยาย/เครดิต");
  if (new Set(qa.images.map(i => i.src)).size !== qa.images.length || images.some(image => !qa.images.some(i => i.src === image.src)) || qa.images.some(i => !images.some(image => image.src === i.src)))
    throw new Error("QA: ต้องมีหลักฐานสิทธิ์และการตรวจของภาพทุกใบตรงกับบทความ");
  if (!images.length && !qa.noImageReason) throw new Error("QA: กรุณาระบุเหตุผลเมื่อไม่มีภาพที่ใช้ได้");
  const links = new Set<string>([entry.url, entry.sourceUrl].filter(Boolean));
  const visible = entry.content ? [] as string[] : [entry.body];
  const walk = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      const item = value as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string") visible.push(item.text);
      if (item.type === "image") { const attrs = item.attrs as { title?: string }; if (attrs?.title) visible.push(attrs.title); }
      if (item.type === "link") { const attrs = item.attrs as { href?: string }; if (attrs?.href) links.add(attrs.href); }
      Object.values(item).forEach(walk);
  };
  walk(entry.content);
  if (qa.images.some(image => !visible.join(" ").toLowerCase().includes(image.credit.toLowerCase()))) throw new Error("QA: เครดิตภาพต้องมองเห็นในคำบรรยายหรือเนื้อหา ไม่ใช่เฉพาะบันทึก QA/alt");
  if ([...links].some(link => !qa.links.includes(link))) throw new Error("QA: ต้องตรวจลิงก์ต้นทางและลิงก์ในบทความทุกลิงก์");
  if (entry.sourceUrl && !qa.claims.some(claim => claim.sourceUrl === entry.sourceUrl)) throw new Error("QA: ต้องมีหลักฐานจาก sourceUrl ของรายการ");
  const times = [...qa.claims.map(c => c.checkedAt), ...qa.images.map(i => i.inspectedAt), qa.render.checkedAt];
  if (times.some(time => Date.parse(time) > Date.now() + 60_000 || Date.parse(time) < Date.now() - 7 * 86400000)) throw new Error("QA: หลักฐานต้องตรวจภายใน 7 วันและไม่ใช่เวลาในอนาคต");
  db.editorialQa[entry.id] = { evidence: qa, agentId, hash: editorialHash(entry), at: new Date().toISOString() };
}
export function requireEditorialQa(db: Database, entry: Entry, basedOnUpdatedAt = entry.updatedAt) {
  const qa = db.editorialQa[entry.id];
  if (!qa || qa.hash !== editorialHash(entry) || (qa.basedOnUpdatedAt !== undefined && qa.basedOnUpdatedAt !== basedOnUpdatedAt) || Date.parse(qa.at) < Date.now() - 7 * 86400000)
    throw new Error("QA_REQUIRED: อ่านงานกลับและใช้ record_entry_qa ตรวจหลักฐาน ภาพ ลิงก์ และการแสดงผลฉบับล่าสุดก่อนส่งตรวจ/เผยแพร่");
}
