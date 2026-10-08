"use client";
import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { type ArticleDocument, imageUrl } from "@/lib/article";
import { ImageField } from "./image-field";
export default function ArticleEditor({initial,onChange,onBusy}:{initial:ArticleDocument;onChange:(doc:ArticleDocument,text:string)=>void;onBusy:(busy:boolean)=>void}) {
  const [src,setSrc]=useState(""),[alt,setAlt]=useState(""),[caption,setCaption]=useState(""),[link,setLink]=useState("");
  const editor=useEditor({
    extensions:[StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,protocols:["https"],defaultProtocol:"https"}}),Image.configure({allowBase64:false})],
    immediatelyRender:false,
    shouldRerenderOnTransaction:true,
    content:initial,
    editorProps:{attributes:{"aria-label":"เนื้อหาบทความ","role":"textbox","aria-multiline":"true",class:"article-prose"}},
    onUpdate:({editor})=>onChange(editor.getJSON() as ArticleDocument,editor.getText({blockSeparator:"\n\n"})),
  });
  if(!editor) return <p role="status">กำลังเปิดตัวเขียนบทความ…</p>;
  const controls = [
    {label:"ตัวหนา",active:editor.isActive("bold"),run:()=>editor.chain().focus().toggleBold().run()},
    {label:"ตัวเอียง",active:editor.isActive("italic"),run:()=>editor.chain().focus().toggleItalic().run()},
    {label:"หัวข้อ",active:editor.isActive("heading",{level:2}),run:()=>editor.chain().focus().toggleHeading({level:2}).run()},
    {label:"หัวข้อย่อย",active:editor.isActive("heading",{level:3}),run:()=>editor.chain().focus().toggleHeading({level:3}).run()},
    {label:"รายการ",active:editor.isActive("bulletList"),run:()=>editor.chain().focus().toggleBulletList().run()},
    {label:"ลำดับเลข",active:editor.isActive("orderedList"),run:()=>editor.chain().focus().toggleOrderedList().run()},
    {label:"คำอ้างอิง",active:editor.isActive("blockquote"),run:()=>editor.chain().focus().toggleBlockquote().run()},
    {label:"โค้ด",active:editor.isActive("codeBlock"),run:()=>editor.chain().focus().toggleCodeBlock().run()},
  ];
  return <div className="article-editor">
    <div className="article-toolbar" role="group" aria-label="จัดรูปแบบบทความ">{controls.map(c=><button type="button" key={c.label} aria-pressed={c.active} onClick={c.run}>{c.label}</button>)}<button type="button" onClick={()=>editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>ย้อนกลับ</button><button type="button" onClick={()=>editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>ทำซ้ำ</button></div>
    <EditorContent editor={editor}/>
    <details className="editor-insert"><summary>แทรกภาพประกอบ / แก้ภาพที่เลือก</summary><ImageField label="ภาพประกอบ" value={src} onChange={setSrc} onBusy={onBusy}/><label>อธิบายภาพสำหรับผู้อ่าน<input value={alt} maxLength={300} onChange={e=>setAlt(e.target.value)} placeholder="เช่น เปรียบเทียบฉากก่อนและหลังปรับแสง"/></label><label>คำบรรยายใต้ภาพ / เครดิต<input value={caption} maxLength={500} onChange={e=>setCaption(e.target.value)}/></label><div className="article-toolbar"><button type="button" className="button" disabled={!imageUrl.safeParse(src).success || !alt.trim()} onClick={()=>{editor.chain().focus().setImage({src,alt,title:caption}).run();setSrc("");setAlt("");setCaption("");}}>แทรกภาพที่เคอร์เซอร์</button><button type="button" className="button" disabled={!editor.isActive("image")} onClick={()=>{const image=editor.getAttributes("image");setSrc(image.src);setAlt(image.alt || "");setCaption(image.title || "");}}>อ่านข้อมูลภาพที่เลือก</button><button type="button" className="button" disabled={!editor.isActive("image") || !imageUrl.safeParse(src).success || !alt.trim()} onClick={()=>editor.chain().focus().updateAttributes("image",{src,alt,title:caption}).run()}>อัปเดตภาพที่เลือก</button><button type="button" className="button" disabled={!editor.isActive("image")} onClick={()=>editor.chain().focus().deleteSelection().run()}>ลบภาพที่เลือก</button></div></details>
    <details className="editor-insert"><summary>ใส่ลิงก์ในข้อความที่เลือก</summary><label>ลิงก์ HTTPS<input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://"/></label><div className="article-toolbar"><button type="button" disabled={!/^https:\/\//.test(link)} onClick={()=>editor.chain().focus().extendMarkRange("link").setLink({href:link}).run()}>ใส่ลิงก์</button><button type="button" onClick={()=>editor.chain().focus().unsetLink().run()}>เอาลิงก์ออก</button></div></details>
    <p className="field-hint">กดเลือกภาพเพื่อแก้คำบรรยายหรือลบ · รองรับรายการระดับเดียว</p>
  </div>;
}
