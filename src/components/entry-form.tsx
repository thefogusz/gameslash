"use client";
import { useState } from "react";
import { GameTagPicker } from "./game-tag-picker";
import { tagSuggestionsSchema, type TagSuggestion } from "@/lib/game-tags";
import dynamic from "next/dynamic";
import { textDocument } from "@/lib/article";
import { ImageField } from "./image-field";
const ArticleEditor = dynamic(() => import("./article-editor"), { ssr:false });
import { ArrowUpRight, Check, Loader2, Send } from "lucide-react";
import {
  entryInput,
  kindLabels,
  type Entry,
  type EntryInput,
} from "@/lib/model";

export function EntryForm({
  initial,
  categories,
  onSave,
  admin = false,
  reviewOnly = false,
  onDirty,
}: {
  initial?: Partial<Entry>;
  categories: string[];
  onSave: (entry: EntryInput, status: Entry["status"], tagSuggestions: TagSuggestion[]) => Promise<void>;
  admin?: boolean;
  reviewOnly?: boolean;
  onDirty?:()=>void;
}) {
  const [kind, setKind] = useState<Entry["kind"]>(initial?.kind || "game");
  const [gameTags, setGameTags] = useState(initial?.tags || []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [image,setImage] = useState(initial?.image || ""), [coverBusy,setCoverBusy] = useState(false), [editorBusy,setEditorBusy] = useState(false);
  const [body,setBody] = useState(initial?.body || "");
  const [content,setContent] = useState(initial?.content || textDocument(initial?.body || ""));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (coverBusy || editorBusy) { setError("รออัปโหลดภาพให้เสร็จก่อนบันทึก"); return; }
    const data = new FormData(event.currentTarget);
    const parsed = entryInput.safeParse({
      kind,
      title: data.get("title"),
      description: data.get("description"),
      author: data.get("author"),
      category: data.get("category"),
      url: data.get("url") || "",
      sourceUrl: data.get("sourceUrl") || "",
      image,
      imageAlt: data.get("imageAlt") || "",
      body,
      ...(kind === "article" ? { content } : {}),
      tags: kind === "game" ? gameTags : String(data.get("tags") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" · "));
      return;
    }
    const suggestions = tagSuggestionsSchema.safeParse(kind === "game" && (data.get("tagName") || data.get("tagReason")) ? [{ name: data.get("tagName"), reason: data.get("tagReason") }] : []);
    if (!suggestions.success) { setError("กรุณาใส่ชื่อแท็กและเหตุผลอย่างน้อย 10 ตัวอักษร"); return; }
    setBusy(true);
    try {
      await onSave(
        parsed.data,
        admin && !reviewOnly ? (data.get("status") as Entry["status"]) : "pending",
        suggestions.data,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="entry-form" onSubmit={submit} onChangeCapture={onDirty}>
      {admin && (
        <label>
          ประเภท
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Entry["kind"])}
          >
            {Object.entries(kindLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="form-pair">
        <label>
          {kind === "game" ? "ชื่อเกม" : "ชื่อรายการ / หัวข้อ"}
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={initial?.title}
            placeholder={
              kind === "game" ? "เกมของคุณชื่ออะไร?" : "หัวข้อที่อยากแบ่งปัน"
            }
          />
        </label>
        <label>
          {kind === "game" ? "ผู้สร้าง / สตูดิโอ" : "ชื่อผู้เขียน"}
          <input
            name="author"
            required
            minLength={2}
            maxLength={100}
            defaultValue={initial?.author}
            placeholder="ชื่อที่ต้องการแสดง"
          />
        </label>
      </div>
      <label>
        คำอธิบายสั้น
        <textarea
          name="description"
          required
          minLength={10}
          maxLength={400}
          rows={3}
          defaultValue={initial?.description}
          placeholder="เล่าให้รู้จักใน 1–2 ประโยค"
        />
      </label>
      <div className="form-pair">
        <label>
          หมวดหมู่
          <input
            name="category"
            list="entry-categories"
            required
            maxLength={60}
            defaultValue={
              initial?.category || (kind === "post" ? "พูดคุย" : "")
            }
            placeholder="เลือกหรือพิมพ์หมวดหมู่"
          />
          <datalist id="entry-categories">
            {[
              ...categories,
              "พูดคุย",
              "โชว์ผลงาน",
              "ขอฟีดแบ็ก",
              "เขียนโค้ด",
              "เอนจินเกม",
              "เริ่มต้นทำเกม",
            ].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        {kind !== "game" && <label>แท็ก <span className="field-hint">คั่นด้วยจุลภาค สูงสุด 20 แท็ก</span><input name="tags" maxLength={1200} defaultValue={initial?.tags?.join(", ")} placeholder="เครื่องมือ, เทคนิค" /></label>}
      </div>
      {kind === "game" && <>
        <GameTagPicker value={gameTags} onChange={tags => { setGameTags(tags); onDirty?.(); }} />
        <details className="tag-suggestion"><summary>หาแท็กที่ใช่ไม่เจอ? เสนอให้ Dots ตรวจ</summary>
          <p>Dots จะตรวจจากลิงก์เกมที่คุณส่ง พร้อมวิเคราะห์ว่าใช้แท็กเดิมได้หรือควรเพิ่มแท็กใหม่ คำขอนี้ยังไม่เพิ่มแท็กเข้าคลังทันที</p>
          <label>ชื่อแท็กที่เสนอ<input name="tagName" maxLength={60} placeholder="เสนอหนึ่งแท็กต่อครั้ง" /></label>
          <label>เกมมีลักษณะนี้อย่างไร?<textarea name="tagReason" maxLength={600} rows={3} placeholder="อธิบายวิธีเล่นหรือจุดที่ตรวจสอบได้จากเว็บไซต์เกม" /></label>
        </details>
      </>}
      <label>
        {kind === "game" ? "ลิงก์เว็บไซต์เกม" : "ลิงก์เว็บไซต์"}{" "}
        {["post", "article"].includes(kind) && (
          <span className="field-hint">ไม่บังคับ</span>
        )}
        <input
          name="url"
          type="url"
          required={["game", "tool"].includes(kind)}
          maxLength={2000}
          defaultValue={initial?.url}
          placeholder="https://"
        />
      </label>
      <div className="form-pair">
        <label>
          ลิงก์แหล่งที่มา <span className="field-hint">ไม่บังคับ</span>
          <input
            name="sourceUrl"
            type="url"
            maxLength={2000}
            defaultValue={initial?.sourceUrl}
            placeholder="โพสต์ต้นทางหรือเว็บไซต์ผู้สร้าง"
          />
        </label>
      </div>
      {admin ? <ImageField label="ภาพปก" value={image} onChange={url=>{setImage(url);onDirty?.();}} onBusy={setCoverBusy}/> : <label>ลิงก์ภาพปก<input value={image} onChange={e=>setImage(e.target.value)} maxLength={2000} placeholder="https://…/cover.jpg"/></label>}
      <label>คำอธิบายภาพปก<input name="imageAlt" defaultValue={initial?.imageAlt || ""} maxLength={300} placeholder="อธิบายสิ่งที่เห็นในภาพ"/></label>
      {kind === "article" ? <section><h3>เนื้อหาบทความ</h3><ArticleEditor initial={content} onChange={(doc,text)=>{setContent(doc);setBody(text.slice(0,20000));onDirty?.();}} onBusy={setEditorBusy}/></section> : <label>รายละเอียดเพิ่มเติม<textarea name="body" maxLength={20000} rows={kind === "post" ? 8 : 4} value={body} onChange={e=>setBody(e.target.value)} placeholder="วิธีเล่น แพลตฟอร์ม หรือสิ่งที่ควรรู้"/></label>}
      {admin && !reviewOnly && (
        <label>
          สถานะ
          <select name="status" defaultValue={initial?.status || "draft"}>
            <option value="draft">ฉบับร่าง</option>
            <option value="pending">รอตรวจสอบ</option>
            <option value="published">เผยแพร่บนเว็บไซต์</option>
            <option value="archived">เก็บเข้าคลัง (ซ่อนจากเว็บ)</option>
          </select>
        </label>
      )}
      {!admin && (
        <label className="checkbox">
          <input type="checkbox" required />
          ฉันตรวจสอบข้อมูลและที่มาของภาพแล้ว และยอมรับให้แสดงข้อมูลนี้บน
          gameslash
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-end">
        <p>
          {admin && !reviewOnly
            ? "รายการสถานะเผยแพร่จะอัปเดตบนเว็บทันที"
            : "ทีมงานจะตรวจรายการก่อนเผยแพร่"}
        </p>
        <button className="button primary" disabled={busy || coverBusy || editorBusy} type="submit">
          {busy ? (
            <Loader2 className="spin" size={16} />
          ) : admin ? (
            <Check size={16} />
          ) : (
            <Send size={16} />
          )}{" "}
          {busy ? "กำลังบันทึก…" : admin && !reviewOnly ? "บันทึกรายการ" : "ส่งให้ทีมงานตรวจ"}
        </button>
      </div>
    </form>
  );
}
export function SubmitPanel({
  categories,
  type,
}: {
  categories: string[];
  type?: string;
}) {
  const [done, setDone] = useState(false),
    [kind, setKind] = useState<"game" | "post">(
      type === "post" ? "post" : "game",
    );
  if (done)
    return (
      <div className="success-panel">
        <div className="success-icon">
          <Check size={28} />
        </div>
        <h1>ได้รับรายการของคุณแล้ว</h1>
        <p>
          ขอบคุณที่ร่วมเติมสิ่งดี ๆ ให้ gameslash
          <br />
          รายการจะปรากฏเมื่อทีมงานตรวจและเผยแพร่แล้ว
        </p>
        <button className="button primary" onClick={() => setDone(false)}>
          ส่งอีกรายการ <ArrowUpRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="submit-wrap">
      <div className="page-heading">
        <span className="eyebrow">SHARE SOMETHING GOOD</span>
        <h1>ให้คนอื่นได้ค้นพบผลงานของคุณ</h1>
        <p>แนะนำเกมที่ชอบ หรือแบ่งปันเรื่องราวกับคนทำเกมด้วยกัน</p>
      </div>
      <div className="segment-control">
        <button aria-pressed={kind === "game"} onClick={() => setKind("game")}>
          แนะนำเกม
        </button>
        <button aria-pressed={kind === "post"} onClick={() => setKind("post")}>
          โพสต์คอมมูนิตี้
        </button>
      </div>
      <EntryForm
        key={kind}
        initial={{ kind }}
        categories={categories}
        onSave={async (entry, _status, tagSuggestions) => {
          const response = await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry, tagSuggestions, website: "" }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          setDone(true);
        }}
      />
    </div>
  );
}
