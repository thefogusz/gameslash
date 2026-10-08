import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { articleDocumentSchema, imageUrl, textDocument } from "../src/lib/article";
import { normalizeImage, maxImageBytes } from "../src/lib/media";
import { ArticleContent, legacyGuideDocument } from "../src/components/article-content";
test("legacy guides gain real headings and a linked table of contents without losing text",()=>{
  const body="หัวข้อแรก\n\nคำอธิบายแรก\n\nหัวข้อสอง\n\nคำอธิบายสอง";
  const doc=legacyGuideDocument(body);
  assert.equal(articleDocumentSchema.safeParse(doc).success,true);
  const html=renderToStaticMarkup(<ArticleContent content={doc}/>);
  assert.match(html,/<nav[^>]+aria-label="สารบัญบทความ"/);
  assert.match(html,/<h2 id="section-0">หัวข้อแรก<\/h2>/);
  assert.match(html,/href="#section-2"/);
  for(const part of body.split("\n\n"))assert.ok(html.includes(part));
});
test("illustrated article roundtrip preserves formatting, image caption and legacy text",()=>{
  const doc=articleDocumentSchema.parse({type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"<script>alert(1)</script>",marks:[{type:"bold"}]}]},{type:"image",attrs:{src:"https://example.com/scene.png",alt:"ฉากตัวอย่าง",title:"เครดิตผู้สร้าง"}}]});
  assert.deepEqual(articleDocumentSchema.parse(JSON.parse(JSON.stringify(doc))),doc);
  const html=renderToStaticMarkup(<ArticleContent content={doc}/>);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>")); assert.ok(html.includes('alt="ฉากตัวอย่าง"')); assert.ok(html.includes("<figcaption>เครดิตผู้สร้าง</figcaption>"));
  assert.equal(textDocument("หนึ่ง\nสอง\n\nสาม").content.length,2);
});
test("article boundaries reject executable URLs, raw HTML, unsupported nesting and oversized content",()=>{
  for(const src of ["javascript:alert(1)","data:image/svg+xml,test","/api/media/../../secret","http://example.com/a.png"]){
    assert.equal(imageUrl.safeParse(src).success,false);
  }
  assert.ok(imageUrl.safeParse(`/api/media/${"a".repeat(64)}.webp`).success);
  const invalid=[{type:"html",text:"<script/>"},{type:"paragraph",content:[{type:"text",text:"link",marks:[{type:"link",attrs:{href:"javascript:alert(1)"}}]}]},{type:"bulletList",content:[{type:"listItem",content:[{type:"bulletList",content:[]}]}]}];
  invalid.forEach(node=>assert.equal(articleDocumentSchema.safeParse({type:"doc",content:[node]}).success,false));
  assert.equal(articleDocumentSchema.safeParse({type:"doc",content:Array.from({length:10},()=>({type:"paragraph",content:[{type:"text",text:"a".repeat(15000)}]}))}).success,false);
});
test("uploads decode and normalize real pixels, reject SVG, corrupt and oversized images",async()=>{
  const png=await sharp({create:{width:2400,height:1200,channels:3,background:"#79dfc4"}}).png().toBuffer();
  const {data,info}=await normalizeImage(png);
  assert.equal(info.width,2000); assert.equal(info.height,1000); assert.equal((await sharp(data).metadata()).format,"webp");
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),Buffer.from("not an image"),Buffer.alloc(maxImageBytes+1)]) await assert.rejects(normalizeImage(bytes));
});
