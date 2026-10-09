"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, MessageSquare, Upload, X } from "lucide-react";
import type { Database } from "@/lib/model";

export function Feedback() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState("");
  const reading = useRef(0);
  const [loadingImage, setLoadingImage] = useState(false);
  useEffect(() => () => { reading.current++; }, []);
  async function attach(file: File) {
    const version = ++reading.current;
    setError("");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      setLoadingImage(false); setError("ใช้ภาพ JPG, PNG หรือ WebP ขนาดไม่เกิน 2 MB"); return;
    }
    setLoadingImage(true);
    const reader = new FileReader();
    reader.onload = () => { if (reading.current === version) { setImage(String(reader.result)); setLoadingImage(false); } };
    reader.onerror = () => { if (reading.current === version) { setError("อ่านภาพไม่สำเร็จ กรุณาเลือกใหม่"); setLoadingImage(false); } };
    reader.readAsDataURL(file);
  }
  return <>
    <button className="feedback-card" onClick={() => { setTicket(""); dialog.current?.showModal(); }}>
      <MessageSquare size={18} /><span><strong>แจ้งฟีดแบค</strong><small>พบปัญหา หรือมีไอเดีย?</small></span><ArrowUpRight size={15} />
    </button>
    <dialog ref={dialog} className="feedback-dialog" aria-labelledby="feedback-title" onCancel={e => { if (busy) e.preventDefault(); }}
      onPaste={e => { if (busy || ticket) return; const file = Array.from(e.clipboardData.items).find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile(); if (file) { e.preventDefault(); void attach(file); } }}>
      <div className="feedback-heading"><h2 id="feedback-title">แจ้งฟีดแบค</h2><button type="button" className="icon-button" aria-label="ปิดฟีดแบค" disabled={busy} onClick={() => dialog.current?.close()}><X size={18} /></button></div>
      {ticket ? <div className="feedback-success" role="status"><Check size={28} /><h3>ส่งฟีดแบคแล้ว</h3><p>ทีมงานได้รับ ticket ของคุณแล้ว ขอบคุณที่ช่วยให้ Gameslash ดีขึ้น</p><small>Ticket #{ticket.slice(0, 8)}</small><button className="button primary" onClick={() => dialog.current?.close()}>เรียบร้อย</button></div> :
        <form onSubmit={async e => {
          e.preventDefault(); if (busy || loadingImage) return; setBusy(true); setError("");
          try {
            const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, page: location.pathname, ...(image ? { image } : {}) }) });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || "ส่งไม่สำเร็จ กรุณาลองใหม่");
            setTicket(result.id); setMessage(""); setImage("");
          } catch (e) { setError(e instanceof Error ? e.message : "ส่งไม่สำเร็จ กรุณาลองใหม่"); } finally { setBusy(false); }
        }}>
          <p>บอกปัญหาที่พบ หรือสิ่งที่อยากให้เราปรับปรุง</p>
          <label htmlFor="feedback-message">ข้อความ</label>
          <textarea id="feedback-message" autoFocus required minLength={3} maxLength={4000} rows={5} placeholder="เล่าให้เราฟังได้เลย…" value={message} disabled={busy} onChange={e => setMessage(e.target.value)} />
          <label className="feedback-upload"><Upload size={18} /><span>{loadingImage ? "กำลังอ่านภาพ…" : "อัปโหลดภาพ หรือวางด้วย Ctrl+V"}<small>JPG, PNG, WebP · ไม่เกิน 2 MB · 1 ภาพ</small></span><input aria-label="อัปโหลดภาพฟีดแบค" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void attach(file); e.target.value = ""; }} /></label>
          {image && <div className="feedback-preview"><img src={image} alt="ภาพแนบฟีดแบค" /><button className="icon-button" type="button" aria-label="ลบภาพแนบ" disabled={busy} onClick={() => { reading.current++; setLoadingImage(false); setImage(""); }}><X size={16} /></button></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="feedback-actions"><small>ส่งถึงทีมงานโดยตรง</small><button className="button primary" disabled={busy || loadingImage}>{busy ? "กำลังส่ง…" : "ส่งฟีดแบค"}<ArrowUpRight size={16} /></button></div>
        </form>}
    </dialog>
  </>;
}

export function FeedbackTickets({ tickets, busy, update }: { tickets: Database["feedback"]; busy: boolean; update: (id: string, status: "open" | "closed") => Promise<unknown> }) {
  return <div><div className="studio-heading"><div><span className="eyebrow">FEEDBACK</span><h1>ฟีดแบคจากผู้ใช้งาน</h1><p>{tickets.filter(t => t.status === "open").length} ticket ที่ยังเปิดอยู่</p></div></div>
    {!tickets.length && <div className="empty-state">ยังไม่มีฟีดแบค</div>}
    <div className="feedback-tickets">{tickets.map(t => <article className="feedback-ticket" key={t.id}>
      <header><strong>#{t.id.slice(0, 8)} · {t.status === "open" ? "เปิด" : "ปิดแล้ว"}</strong><time dateTime={t.createdAt}>{new Date(t.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</time></header>
      <p>{t.message}</p><small>หน้าที่แจ้ง: {t.page}</small>
      {t.image && <a href={t.image} target="_blank" rel="noreferrer"><img src={t.image} alt={`ภาพแนบ ticket ${t.id.slice(0, 8)}`} /></a>}
      <button className="button" disabled={busy} onClick={() => { void update(t.id, t.status === "open" ? "closed" : "open").catch(() => {}); }}>{t.status === "open" ? "ปิด ticket" : "เปิด ticket อีกครั้ง"}</button>
    </article>)}</div>
  </div>;
}
