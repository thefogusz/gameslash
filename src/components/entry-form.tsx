"use client";
import { toolWorkflowCategories } from "@/lib/directory-filters";
import { ConsoleSelect } from "./console-select";
import { useState } from "react";
import { GameTagPicker } from "./game-tag-picker";
import { tagSuggestionsSchema, type TagSuggestion } from "@/lib/game-tags";
import dynamic from "next/dynamic";
import { firstArticleImage, textDocument } from "@/lib/article";
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
  const [category, setCategory] = useState(initial?.category || "");
  const [customCategory, setCustomCategory] = useState(false);
  const [popularityScore, setPopularityScore] = useState(String(initial?.popularity?.score || ""));
  const categoryOptions = [...new Set([
    ...(kind === "tool" ? toolWorkflowCategories : kind === "game" ? categories : kind === "article" ? ["ข่าว AI game", "อัปเดตเครื่องมือ", "เทคนิคทำเกม"] : ["พูดคุย", "โชว์ผลงาน", "ขอฟีดแบ็ก"]),
    ...(initial?.kind === kind && initial.category ? [initial.category] : []),
  ])];
  const [gameTags, setGameTags] = useState(initial?.tags || []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [image,setImage] = useState(initial?.image || ""), [coverBusy,setCoverBusy] = useState(false), [editorBusy,setEditorBusy] = useState(false);
  const [body,setBody] = useState(initial?.body || "");
  const [content,setContent] = useState(() => {
    const doc = initial?.content || textDocument(initial?.body || "");
    return initial?.kind === "article" && initial.image && !firstArticleImage(doc)
      ? { ...doc, content: [{ type: "image" as const, attrs: { src: initial.image, alt: initial.imageAlt || initial.title || "" } }, ...doc.content] }
      : doc;
  });
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
      image: kind === "article" ? "" : image,
      imageAlt: kind === "article" ? "" : data.get("imageAlt") || "",
      body,
      popularity: kind === "tool" && admin && popularityScore ? {
        score: Number(popularityScore), reason: data.get("popularityReason"),
        sources: String(data.get("popularitySources") || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean),
        checkedAt: data.get("popularityDate"),
      } : null,
      ...(kind === "article" ? { content } : {}),
      tags: kind === "game" ? gameTags : kind === "tool" ? initial?.tags || [] : String(data.get("tags") || "")
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
        <div className="console-field">
          ประเภท
          <ConsoleSelect label="ประเภท"
            value={kind}
            onChange={(value) => { setKind(value as Entry["kind"]); setCategory(""); setCustomCategory(false); onDirty?.(); }}
          >
            {Object.entries(kindLabels).filter(([k]) => k !== "post" || initial?.kind === "post").map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </ConsoleSelect>
        </div>
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
          {kind === "game" ? "ผู้สร้าง / สตูดิโอ" : kind === "tool" ? "ผู้พัฒนาเครื่องมือ" : "ชื่อผู้เขียน"}
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
        <div className="console-field">
          หมวดหมู่
          {admin ? <>
            <ConsoleSelect label="หมวดหมู่" value={customCategory ? "__custom" : category}
              onChange={value => { setCustomCategory(value === "__custom"); setCategory(value === "__custom" ? "" : value); onDirty?.(); }}>
              <option value="">เลือกหมวดหมู่</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom">เพิ่มหมวดหมู่ใหม่…</option>
            </ConsoleSelect>
            {customCategory ? <input name="category" aria-label="ชื่อหมวดหมู่ใหม่" required maxLength={60} value={category} onChange={e => setCategory(e.target.value)} placeholder="ชื่อหมวดหมู่ใหม่" /> : <input type="hidden" name="category" value={category} />}
          </> : <>
            <input name="category" list="entry-categories" required maxLength={60} defaultValue={initial?.category || (kind === "post" ? "พูดคุย" : "")} placeholder="เลือกหรือพิมพ์หมวดหมู่" />
            <datalist id="entry-categories">{categoryOptions.map(c => <option key={c} value={c} />)}</datalist>
          </>}
        </div>
        {kind !== "game" && kind !== "tool" && <label>แท็ก <span className="field-hint">คั่นด้วยจุลภาค สูงสุด 20 แท็ก</span><input name="tags" maxLength={1200} defaultValue={initial?.tags?.join(", ")} placeholder="เครื่องมือ, เทคนิค" /></label>}
      </div>
      {kind === "game" && <>
        <GameTagPicker value={gameTags} onChange={tags => { setGameTags(tags); onDirty?.(); }} />
        <details className="tag-suggestion"><summary>หาแท็กที่ใช่ไม่เจอ? เสนอแท็กใหม่</summary>
          <p>เสนอชื่อแท็กที่เหมาะกับเกมของคุณ พร้อมคำอธิบายสั้น ๆ เพื่อให้ทีมงานพิจารณา</p>
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
      {kind !== "article" && <>{admin ? <ImageField label="ภาพปก" value={image} onChange={url=>{setImage(url);onDirty?.();}} onBusy={setCoverBusy}/> : <label>ลิงก์ภาพปก<input value={image} onChange={e=>setImage(e.target.value)} maxLength={2000} placeholder="https://…/cover.jpg"/></label>}
      <label>คำอธิบายภาพปก<input name="imageAlt" defaultValue={initial?.imageAlt || ""} maxLength={300} placeholder="อธิบายสิ่งที่เห็นในภาพ"/></label>
      </>}
      {kind === "article" && <p className="field-hint">ภาพแรกในบทความจะใช้แสดงในการ์ดข่าวและเมื่อแชร์ลิงก์ ไม่ต้องใส่ภาพปกแยก</p>}
      {kind === "article" ? <section><h3>เนื้อหาบทความ</h3><ArticleEditor initial={content} onChange={(doc,text)=>{setContent(doc);setBody(text.slice(0,20000));onDirty?.();}} onBusy={setEditorBusy}/></section> : <label>รายละเอียดเพิ่มเติม<textarea name="body" maxLength={20000} rows={kind === "post" ? 8 : 4} value={body} onChange={e=>setBody(e.target.value)} placeholder="วิธีเล่น แพลตฟอร์ม หรือสิ่งที่ควรรู้"/></label>}
      {admin && kind === "tool" && <fieldset className="popularity-editor">
        <legend>ดาวความนิยมของเครื่องมือ</legend>
        <p className="field-hint">ประเมินฐานผู้ใช้ ผลงานและระบบนิเวศ และการเป็นที่รู้จัก พร้อมหลักฐาน ไม่ใช่คะแนนคุณภาพหรือรีวิวผู้ใช้</p>
        <ConsoleSelect label="ดาวความนิยม" value={popularityScore} onChange={value => { setPopularityScore(value); onDirty?.(); }}>
          <option value="">ยังไม่ประเมิน / นำคะแนนออก</option>
          {[1,2,3,4,5].map(score => <option value={score} key={score}>{score} ดาว</option>)}
        </ConsoleSelect>
        {popularityScore && <>
          <label>เหตุผลจากหลักฐาน<textarea name="popularityReason" required minLength={20} maxLength={400} rows={3} defaultValue={initial?.popularity?.reason} /></label>
          <label>แหล่งข้อมูล HTTPS (หนึ่งลิงก์ต่อบรรทัด สูงสุด 5)<textarea name="popularitySources" required rows={3} defaultValue={initial?.popularity?.sources.join("\n")} /></label>
          <label>วันที่ตรวจข้อมูล<input name="popularityDate" type="date" required defaultValue={initial?.popularity?.checkedAt || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })} /></label>
        </>}
      </fieldset>}
      {admin && !reviewOnly && (
        <div className="console-field">
          สถานะ
          <ConsoleSelect label="สถานะ" name="status" defaultValue={initial?.status || "draft"} onChange={() => onDirty?.()}>
            <option value="draft">ฉบับร่าง</option>
            <option value="pending">รอตรวจสอบ</option>
            <option value="published">เผยแพร่บนเว็บไซต์</option>
            <option value="archived">ย้ายเข้าถังขยะ (ซ่อนจากเว็บ)</option>
          </ConsoleSelect>
        </div>
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
