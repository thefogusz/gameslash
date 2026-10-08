"use client";
import { ConsoleSelect } from "./console-select";
import type { TagSuggestion } from "@/lib/game-tags";
import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import type { Entry, EntryInput } from "@/lib/model";
import { activeJob, type CollectionJob, type CollectionSource } from "@/lib/collection-model";
import { EntryForm } from "./entry-form";
type Snapshot = { sources: CollectionSource[]; jobs: (CollectionJob & { candidateCount: number; matchCount: number })[]; revision: number; configured: boolean; budget: { remaining: number; expiresAt: string } | null };
const labels: Record<CollectionJob["status"], string> = { starting: "กำลังเริ่ม", unknown: "ต้องตรวจใน Apify", READY: "เข้าคิวแล้ว", RUNNING: "กำลังรวบรวม", SUCCEEDED: "อ่านผลได้แล้ว", FAILED: "งานไม่สำเร็จ", "TIMED-OUT": "หมดเวลา", ABORTING: "กำลังหยุด", ABORTED: "หยุดแล้ว" };
export function CollectionPanel({ entries, categories, createDraft, openInbox, refreshCatalog }: { entries: Entry[]; categories: string[]; createDraft: (jobId: string, sourceUrl: string, entry: EntryInput, tagSuggestions: TagSuggestion[]) => Promise<void>; openInbox: () => void; refreshCatalog: () => Promise<void> }) {
  const [data, setData] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState(""), [query, setQuery] = useState(""), [candidateUrl, setCandidateUrl] = useState("");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState<10 | 100 | 950>(10), [notice, setNotice] = useState("");
  async function load(body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/collections?${new URLSearchParams({ jobId: selected, query, page: String(page) })}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "โหลดข้อมูลไม่ได้"); setData(result); await refreshCatalog();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [selected, query, page]);
  const job = data?.jobs.find(j => j.id === selected) || data?.jobs[0];
  const candidate = job?.candidates.find(c => c.url === candidateUrl);
  const posts = job?.candidates || [];
  const matchCount = job?.matchCount || 0;

  const hasActive = data?.jobs.some(activeJob);
  return <section className="collection-panel">
    <div className="collection-title"><div><span className="eyebrow">COLLECT · CURATE · REVIEW</span><h2>คลังความรู้จากชุมชน</h2><p>เกม เทคนิค เครื่องมือ แนวทาง และ repo — คัดสิ่งที่มีประโยชน์ก่อนลงเว็บ</p></div><button className="button" disabled={busy} onClick={() => load()}><RefreshCw size={14} />โหลดสถานะ</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="success-notice" role="status">{notice} <button className="text-link" onClick={openInbox}>เปิดกล่องรอตรวจ</button></p>}
    <div className={`collection-connection ${data?.configured ? "ready" : ""}`}><strong>{data?.configured ? "ตั้งค่าคีย์ Apify แล้ว" : "รอเชื่อมบัญชี Apify"}</strong><span>{data?.configured ? `วงเงินทดลองใช้ฟรีคงเหลือ $${data.budget?.remaining.toFixed(2) ?? "0.00"} · ${data.budget ? "ใช้ได้ถึง " + new Date(data.budget.expiresAt).toLocaleString("th-TH") : "รอตรวจเครดิตฟรีใน Apify"}` : "เพิ่ม APIFY_TOKEN ใน Environment Variables ของ Vercel เพื่อเปิดใช้ปุ่มรวบรวม"}</span><small>กันวงเงินเต็มเพดานก่อนรัน · ไม่ต่อวงเงินอัตโนมัติ · ไม่ใช่ยอด Billing แบบสด</small></div>
    <div className="collection-sources"><div><h3>แหล่งข้อมูลของคุณ</h3><p className="field-hint">ยืนยันว่ากลุ่มเปิดสาธารณะก่อนเพิ่ม ไม่ใช้ cookies หรือบัญชี Facebook เข้าถึงกลุ่มปิด</p>
      <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void load({ action: "source", revision: data?.revision, source: { id: crypto.randomUUID(), name: form.get("name"), url: form.get("url") } }); }}>
        <label>ชื่อแหล่งข้อมูล<input name="name" required minLength={2} maxLength={80} defaultValue="AI Game Dev Thailand" /></label><label>ลิงก์กลุ่มสาธารณะ<input name="url" type="url" required maxLength={300} defaultValue="https://www.facebook.com/groups/1108191221217612" /></label>
        <label className="checkbox"><input type="checkbox" required />แหล่งนี้เป็นกลุ่มสาธารณะ</label><button className="button" disabled={busy || !data}>เพิ่มแหล่งข้อมูล</button>
      </form></div><div><div className="console-field">ขนาดการรวบรวม<ConsoleSelect label="ขนาดการรวบรวม" value={limit} onChange={value => setLimit(Number(value) as 10 | 100 | 950)}><option value={10}>ทดลอง 10 โพสต์ · เพดาน $0.25</option><option value={100}>อ่าน 100 โพสต์ · เพดาน $0.75</option><option value={950}>อ่านย้อนหลังสูงสุด 950 โพสต์ · เพดาน $4.85</option></ConsoleSelect></div><p className="field-hint">อ่านจากใหม่ไปเก่า สูงสุด 10 นาทีต่อรอบ จำนวนจริงขึ้นกับการเข้าถึง Facebook และเครดิตฟรีที่เหลือ</p>
      {data?.sources.map(source => <div className="collection-source" key={source.id}><a href={source.url} target="_blank" rel="noreferrer"><strong>{source.name}</strong><ArrowUpRight size={14} /></a><div><button className="button primary" disabled={busy || !data.configured || hasActive} onClick={() => load({ action: "start", sourceId: source.id, requestId: crypto.randomUUID(), limit })}>รวบรวม {limit} โพสต์</button><button className="text-danger" disabled={busy} onClick={() => load({ action: "remove_source", id: source.id, revision: data.revision })}>นำแหล่งออก</button></div></div>)}
      {!data?.sources.length && <p className="collection-empty">เพิ่มแหล่งข้อมูลเพื่อเริ่มรวบรวม</p>}{hasActive && <p className="field-hint">มีงานที่ต้องตรวจสถานะก่อนเริ่มรอบใหม่</p>}
    </div></div>
    <div className="collection-title"><div><h3>ผลการรวบรวม</h3><p className="field-hint">ข้อความต้นทางสำหรับอ้างอิง ยังไม่แสดงบนหน้าเว็บ</p></div>{data && data.jobs.length > 0 && <div className="console-field">เลือกงาน<ConsoleSelect label="เลือกงาน" value={job?.id || ""} onChange={value => { setSelected(value); setCandidateUrl(""); setPage(0); }}>{data.jobs.map(j => <option value={j.id} key={j.id}>{j.source.name} · {new Date(j.createdAt).toLocaleString("th-TH")} · {labels[j.status]}</option>)}</ConsoleSelect></div>}</div>
    {job ? <><div className="collection-job"><strong>{labels[job.status]}</strong><span>{job.candidateCount} โพสต์{job.cost !== undefined ? ` · ใช้เครดิต $${job.cost.toFixed(3)}` : ""}</span><button className="button" disabled={busy || !job.runId} onClick={() => load({ action: "sync", id: job.id })}>ตรวจสถานะ / อ่านผลล่าสุด</button><a className="text-link" href={job.runId ? `https://console.apify.com/actors/runs/${job.runId}` : "https://console.apify.com/actors/runs"} target="_blank" rel="noreferrer">ดูใน Apify <ArrowUpRight size={14} /></a></div>
      {job.message && <p className="form-error">{job.message}</p>}{!job.runId && <form className="collection-recover" onSubmit={e => { e.preventDefault(); void load({ action: "sync", id: job.id, runId: new FormData(e.currentTarget).get("runId") }); }}><label>Run ID ที่ตรงกับแหล่งนี้<input name="runId" required pattern="[a-zA-Z0-9]+" maxLength={100} /></label><button className="button" disabled={busy}>เชื่อมงานกลับ</button></form>}
      <label className="search-box"><Search size={15} /><input aria-label="ค้นหาโพสต์ที่รวบรวม" placeholder="ค้นหาเทคนิค, tools, GitHub, repo…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>
      <div className="collection-posts">{posts.map(post => { const exists = entries.some(e => e.sourceUrl === post.url && e.status !== "archived"); return <article key={post.url}><small>{post.author || "ตรวจเครดิตที่ต้นทาง"} {post.time && `· ${post.time.slice(0, 10)}`}</small><details className="collection-post-text"><summary><span>{post.text}</span><b className="post-expand">อ่านโพสต์เต็ม</b><b className="post-collapse">ย่อโพสต์</b></summary><p>{post.text}</p></details><div><a className="text-link" href={post.url} target="_blank" rel="noreferrer">เปิดต้นทาง <ArrowUpRight size={14} /></a><button className="button" disabled={exists} onClick={() => setCandidateUrl(post.url)}>{exists ? "มีในคลังแล้ว" : "เขียนสรุป / เตรียมส่งตรวจ"}</button></div></article>; })}</div>
      {matchCount > 12 && <div className="collection-job"><button className="button" disabled={page === 0} onClick={() => setPage(page - 1)}>ก่อนหน้า</button><span>หน้า {page + 1} / {Math.ceil(matchCount / 12)} · {matchCount} โพสต์</span><button className="button" disabled={(page + 1) * 12 >= matchCount} onClick={() => setPage(page + 1)}>ถัดไป</button></div>}
      {job.status === "SUCCEEDED" && !job.candidateCount && <p className="collection-empty">รอบนี้ไม่มีโพสต์ที่อ่านได้ ตรวจว่ากลุ่มเปิดสาธารณะและดูรายละเอียดใน Apify</p>}
    </> : <p className="collection-empty">งานที่เริ่มจาก Console จะแสดงที่นี่ พร้อมสถานะและเครดิตที่ใช้</p>}
    {candidate && job && <section className="collection-draft" key={candidate.url}><div className="collection-title"><h3>เขียนสรุปใหม่เพื่อส่งตรวจ</h3><button className="button" onClick={() => setCandidateUrl("")}>ปิด</button></div><p className="field-hint">เลือกประเภท: เกม / เครื่องมือ (รวม repo) / ข่าว AI game หรือเทคนิค อย่าคัดลอกบทสนทนาทั้งชุด</p><EntryForm admin reviewOnly categories={categories} initial={{ kind: "article", author: candidate.author, sourceUrl: candidate.url, category: "เทคนิคทำเกม" }} onSave={async (entry, _status, tagSuggestions) => { await createDraft(job.id, candidate.url, entry, tagSuggestions); setCandidateUrl(""); setNotice("ส่งเข้ากล่องรอตรวจแล้ว"); await load(); }} /></section>}
  </section>;
}
