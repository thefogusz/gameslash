import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { entryCover, textDocument } from "../src/lib/article";
import { seedDatabase } from "../src/lib/seed";
import { ArticleContent } from "../src/components/article-content";
import { EntryForm } from "../src/components/entry-form";
import { entrySchema } from "../src/lib/seo";

const db = seedDatabase();
const article = { ...db.entries.find(e => e.kind === "article")!, image: "/images/old.webp", imageAlt: "ปกเก่า",
  content: { ...textDocument("ข้อความนำ"), content: [...textDocument("ข้อความนำ").content,
    { type: "image" as const, attrs: { src: "/images/first.webp", alt: "ภาพแรก", title: "เครดิตภาพ" } },
    { type: "image" as const, attrs: { src: "/images/second.webp", alt: "ภาพที่สอง" } }] } };

test("article cards and structured data use the first content image and its alt", () => {
  assert.equal(entryCover(article).src, "/images/first.webp");
  assert.equal(entryCover({ ...article, image: "" }).src, "/images/first.webp");
  assert.equal(entryCover(article).alt, "ภาพแรก");
  assert.match(JSON.stringify(entrySchema(article)), /https:\/\/gameslash.app\/images\/first.webp/);
});
test("article content retains each image once with its caption", () => {
  const html = renderToStaticMarkup(<ArticleContent content={article.content}/>);
  assert.equal((html.match(/src="\/images\/first.webp"/g) || []).length, 1);
  assert.equal((html.match(/src="\/images\/second.webp"/g) || []).length, 1);
  assert.doesNotMatch(html, /src="\/images\/old.webp"/);
  assert.match(html, /<figcaption>เครดิตภาพ<\/figcaption>/);
});
test("legacy articles retain a cover; games keep their separate cover", () => {
  assert.deepEqual(entryCover({ ...article, content: textDocument("ไม่มีภาพ") }), { src: article.image, alt: article.imageAlt });
  assert.equal(entryCover({ ...article, kind: "game" }).src, article.image);
  assert.equal(entryCover({ ...article, image: "", content: undefined }).src, "");
});
test("article posting removes separate cover fields while games retain them", () => {
  const html = renderToStaticMarkup(<EntryForm initial={article} categories={[]} onSave={async () => {}}/>);
  assert.doesNotMatch(html, /name="imageAlt"|ลิงก์ภาพปก/);
  assert.match(html, /ภาพแรกในบทความ/);
  assert.match(renderToStaticMarkup(<EntryForm initial={{ ...article, kind: "game" }} categories={[]} onSave={async () => {}}/>), /name="imageAlt"/);
});
