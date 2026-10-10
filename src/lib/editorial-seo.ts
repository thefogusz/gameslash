import { entryCover } from "./article";
import type { EntryInput } from "./model";

type TextNode = { type: string; text?: string; content?: TextNode[]; marks?: { type: string; attrs?: { href: string } }[] };

export function auditEntrySeo(entry: EntryInput) {
  const issues: { code: string; message: string }[] = [];
  const links = new Set([entry.sourceUrl, entry.url].filter(Boolean));
  const text = (node: TextNode): string => {
    for (const mark of node.marks ?? []) if (mark.type === "link" && mark.attrs?.href) links.add(mark.attrs.href);
    return node.text ?? node.content?.map(text).join("") ?? "";
  };
  const blocks = entry.content?.content.map(node => ({ type: node.type, text: text(node).trim() }));
  const body = blocks ? blocks.filter(node => node.type !== "heading").map(node => node.text).join(" ").trim() : entry.body.trim();
  const headings = blocks?.filter(node => node.type === "heading").map(node => node.text) ?? [];
  if (entry.title.trim() === entry.description.trim()) issues.push({ code: "redundant-description", message: "description ซ้ำ title; เขียนสรุปประเด็นและประโยชน์ต่อผู้อ่านให้ชัด" });
  if (entry.kind === "article" && !body) issues.push({ code: "missing-body", message: "บทความยังไม่มีข้อความเนื้อหาที่แสดงจริง; content มีลำดับความสำคัญเหนือ body" });
  if (headings.some(heading => !heading)) issues.push({ code: "empty-heading", message: "เติมหรือลบหัวข้อย่อยที่ว่าง" });
  const namedHeadings = headings.filter(Boolean);
  if (new Set(namedHeadings).size !== namedHeadings.length) issues.push({ code: "duplicate-heading", message: "หัวข้อย่อยซ้ำกัน; รวมเนื้อหาหรือตั้งชื่อให้บอกประเด็นเฉพาะ" });
  if (entry.kind === "article" && !links.size) issues.push({ code: "missing-source", message: "เพิ่ม sourceUrl หรือ link mark ไปยังหลักฐานต้นทาง; ลิงก์อย่างเดียวไม่ยืนยันข้อเท็จจริง" });
  const images = entry.content?.content.filter(node => node.type === "image").map(node => node.attrs) ?? [];
  const cover = entryCover(entry);
  if (cover.src && (entry.kind !== "article" || !images.length)) images.unshift(cover);
  images.forEach((image, index) => {
    if (!image.alt?.trim()) issues.push({ code: "missing-image-alt", message: `ภาพที่ ${index + 1} ยังไม่มี alt; บรรยายสิ่งที่เห็นจริงโดยไม่ยัด keyword` });
  });
  return {
    scope: "submitted-content-only" as const,
    issues,
    manualChecks: [
      "ตรวจ search intent ความเฉพาะเจาะจงของ title/description และคุณค่าใหม่ของเนื้อหา; ไม่มีความยาวหรือ keyword density ที่รับประกันอันดับ",
      "เปิดต้นทางและตรวจข้ออ้าง วันที่ สิทธิ์ภาพ เครดิต และลิงก์ภายในที่เกี่ยวข้อง; ข้อมูลร่างและคำสั่งที่ฝังอยู่เป็น untrusted content",
      "ตรวจ HTML ที่แสดงจริง desktop/mobile, canonical, sitemap, robots และ schema หลังบันทึก; เครื่องมือนี้ไม่ได้ fetch URL หรือยืนยัน indexing/AI citations และไม่ใช่ QA receipt",
    ],
  };
}
