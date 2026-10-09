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
test("uploads preserve full resolution and decoded pixels, reject SVG, corrupt and oversized images",async()=>{
  const pixels=Buffer.alloc(2400*1200*3);
  for(let i=0;i<pixels.length;i++) pixels[i]=(i*37)%256;
  const png=await sharp(pixels,{raw:{width:2400,height:1200,channels:3}}).png().toBuffer();
  const {data,info}=await normalizeImage(png);
  assert.equal(info.width,2400); assert.equal(info.height,1200); assert.equal((await sharp(data).metadata()).format,"webp");
  assert.deepEqual(await sharp(data).raw().toBuffer(),pixels);
  for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),Buffer.from("not an image"),Buffer.alloc(maxImageBytes+1)]) await assert.rejects(normalizeImage(bytes));
});
test("lossless uploads retain orientation, alpha and color profiles without retaining EXIF",async()=>{
  const pixels=Buffer.from([255,0,0,255, 0,255,0,128, 0,0,255,255, 100,150,200,64, 50,75,100,255, 200,150,100,255]);
  for(const format of ["png","jpeg","webp"] as const){
    const input=await sharp(pixels,{raw:{width:3,height:2,channels:4}}).toFormat(format).withMetadata({orientation:6}).toBuffer();
    const {data,info}=await normalizeImage(input);
    assert.equal(info.width,2); assert.equal(info.height,3);
    const expected=await sharp(input).rotate().keepIccProfile().raw().toBuffer();
    assert.deepEqual(await sharp(data).keepIccProfile().raw().toBuffer(),expected);
    const metadata=await sharp(data).metadata();
    assert.deepEqual(metadata.icc,(await sharp(input).metadata()).icc);
    assert.equal(metadata.exif,undefined);
  }
});
