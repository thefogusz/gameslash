import test from "node:test";
import assert from "node:assert/strict";
import { entryInput } from "../src/lib/model";
import { auditEntrySeo } from "../src/lib/editorial-seo";

const draft = () => entryInput.parse({ kind: "article", title: "สร้างเกมด้วย Unity", description: "ขั้นตอนเริ่มต้นสร้างเกม พร้อมตัวอย่างจากเอกสาร Unity", author: "GameSlash", category: "เทคนิค", sourceUrl: "https://docs.unity3d.com/", content: { type: "doc", content: [
  { type: "paragraph", content: [{ type: "text", text: "เริ่มสร้างเกมจากโปรเจกต์ Unity แล้วทดสอบการควบคุมตัวละคร" }] },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "เริ่มต้นโปรเจกต์" }] },
  { type: "image", attrs: { src: `/api/media/${"a".repeat(64)}.webp`, alt: "ตัวละครในฉากทดสอบ Unity", title: "ภาพจากผู้สร้าง" } },
] } });
const codes = (entry: ReturnType<typeof draft>) => auditEntrySeo(entry).issues.map(issue => issue.code);

test("preflight accepts Thai content and hash image URLs without claiming ranking or indexing", () => {
  const entry = draft(), original = structuredClone(entry);
  const report = auditEntrySeo(entry);
  assert.deepEqual(report.issues, []);
  assert.equal(report.scope, "submitted-content-only");
  assert.ok(report.manualChecks.length);
  assert.deepEqual(entry, original);
});

test("rich content takes precedence over legacy body and separate article cover", () => {
  const entry = draft();
  entry.body = "Legacy text must not conceal an empty rendered article";
  entry.image = "https://example.com/cover.webp";
  entry.imageAlt = "";
  assert.ok(!codes(entry).includes("missing-image-alt"), "The unused separate article cover must not be audited");
  entry.content = { type: "doc", content: [{ type: "image", attrs: { src: entry.image, alt: "" } }] };
  assert.ok(codes(entry).includes("missing-body"));
  assert.ok(codes(entry).includes("missing-image-alt"));
});

test("preflight finds redundant metadata, empty and duplicate headings, and missing sources", () => {
  const entry = draft();
  entry.description = entry.title;
  entry.sourceUrl = "";
  entry.content!.content.push(
    { type: "heading", attrs: { level: 2 } },
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "เริ่มต้นโปรเจกต์" }] },
  );
  assert.ok(codes(entry).includes("redundant-description"));
  assert.ok(codes(entry).includes("empty-heading"));
  assert.ok(codes(entry).includes("duplicate-heading"));
  assert.ok(codes(entry).includes("missing-source"));
});

test("preflight reads text and source links in nested lists and ignores alt as article text", () => {
  const entry = draft();
  entry.sourceUrl = "";
  entry.content = { type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [
    { type: "text", text: "ขั้นตอนจากเอกสาร Unity", marks: [{ type: "link", attrs: { href: "https://docs.unity3d.com/" } }] },
  ] }] }] }] };
  assert.deepEqual(codes(entry), []);
  entry.content = undefined;
  entry.body = "เนื้อหา legacy ที่ยังรองรับ";
  entry.sourceUrl = "https://example.com/source";
  assert.deepEqual(codes(entry), []);
});

test("game covers are audited alongside content images without requiring an article body", () => {
  const entry = entryInput.parse({ ...draft(), kind: "game", url: "https://example.com/game", content: undefined, image: "https://example.com/game.webp", imageAlt: "" });
  assert.deepEqual(codes(entry), ["missing-image-alt"]);
  entry.content = { type: "doc", content: [{ type: "image", attrs: { src: entry.image, alt: "ภาพเดียวกัน แต่คนละบริบท" } }] };
  assert.deepEqual(codes(entry), ["missing-image-alt"], "An inline alt cannot substitute for the separately rendered game cover alt");
});
