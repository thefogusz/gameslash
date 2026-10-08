"use client";
import { useState } from "react";
import { ArrowUpRight, Check, Inbox, Pencil, Search } from "lucide-react";
import { kindLabels, type Database, type Entry } from "@/lib/model";

export type SubmissionInfo = Record<string, Partial<Pick<Database["ingestions"][string], "agentId" | "context">>>;
type Decision = Database["reviews"][string]["decision"];
export function ReviewPanel({ entries, submissions, agents, reviews, busy, edit, decide, connect }: {
  entries: Entry[];
  submissions: SubmissionInfo;
  agents: { id: string; name: string }[];
  reviews: Database["reviews"];
  busy: boolean;
  edit: (entry: Entry) => void;
  decide: (entry: Entry, decision: Decision, note: string) => Promise<void>;
  connect: () => void;
}) {
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const tabs = [["pending", "รอตรวจ"], ["draft", "ฉบับร่าง"], ["signals", "คำถาม / ปัญหาจากชุมชน"], ["returned", "ส่งกลับแก้ไข"]];
  const matches = (e: Entry, f: string) => f === "signals" ? ["draft", "pending"].includes(e.status) && !!submissions[e.id]?.context?.signal : f === "returned" ? e.status === "draft" && reviews[e.id]?.decision === "return" : e.status === f;
  const items = entries.filter(e => matches(e, filter) && `${e.title} ${e.author}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = items.find(e => e.id === selectedId) || items[0];
  const submitter = (id: string) => agents.find(a => a.id === submissions[id]?.agentId)?.name || (submissions[id]?.agentId ? "เอเจนต์ที่ส่งรายการ" : "ส่งผ่านเว็บ / ผู้ดูแล");
  return <>
    <div className="studio-heading"><div><span className="eyebrow">REVIEW INBOX</span><h1>เลือกสิ่งดี ๆ ให้คนได้ค้นพบ</h1><p>เปิดอ่านที่มา ตรวจรายละเอียด แล้วเลือกว่าจะเผยแพร่หรือส่งกลับแก้ไข</p></div></div>
    <div className="review-toolbar">
      <div className="filter-chips">{tabs.map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label} <b>{entries.filter(e => matches(e, value)).length}</b></button>)}</div>
      <label className="search-box"><Search size={15} /><input aria-label="ค้นหาในกล่องรอตรวจ" placeholder="ค้นหารายการ…" value={query} onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {selected ? <div className="review-workspace">
      <aside className="review-list" aria-label="รายการสำหรับตรวจ">{items.map(item => <button key={item.id} aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}>
        <span className="review-kind">{kindLabels[item.kind]} · {submitter(item.id)}</span>
        <strong>{item.title}</strong><span className="review-excerpt">{item.description}</span>
        <small>{new Date(item.updatedAt).toLocaleDateString("th-TH")}</small>
      </button>)}</aside>
      <ReviewDetail key={`${selected.id}:${selected.updatedAt}`} entry={selected} context={submissions[selected.id]?.context} submitter={submitter(selected.id)} review={reviews[selected.id]} busy={busy} edit={edit} decide={decide} />
    </div> : <div className="review-empty"><Inbox size={32} /><h2>{query ? "ไม่พบรายการที่ค้นหา" : filter === "pending" ? "ตรวจครบแล้ว ไม่มีรายการรอ" : "ยังไม่มีรายการในหมวดนี้"}</h2><p>เมื่อเอเจนต์ส่งงานผ่าน MCP รายการจะเข้าที่นี่ คุณเป็นคนเลือกเผยแพร่เสมอ</p><button className="button" onClick={connect}>ดูวิธีเชื่อมเอเจนต์และแหล่งข้อมูล <ArrowUpRight size={14} /></button></div>}
  </>;
}
function ReviewDetail({ entry, context, submitter, review, busy, edit, decide }: {
  entry: Entry; context?: SubmissionInfo[string]["context"]; submitter: string;
  review?: Database["reviews"][string]; busy: boolean; edit: (entry: Entry) => void;
  decide: (entry: Entry, decision: Decision, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  async function act(decision: Decision) {
    if (decision === "publish" && !checked) { setError("ยืนยันการตรวจข้อมูลและแหล่งที่มาก่อนเผยแพร่"); return; }
    if (decision !== "publish" && !note.trim()) { setError("ใส่หมายเหตุสั้น ๆ เพื่อให้ผู้ส่งทราบว่าควรแก้ตรงไหน"); return; }
    setError("");
    try { await decide(entry, decision, note); } catch (e) { setError((e as Error).message); }
  }
  return <article className="review-detail">
    <div className="review-detail-top"><span className={`status status-${entry.status}`}>{entry.status === "pending" ? "รอคุณตรวจ" : "กำลังเตรียมฉบับร่าง"}</span><button className="button small-button" disabled={busy} onClick={() => edit(entry)}><Pencil size={13} />แก้ไขข้อมูล</button></div>
    <h2>{entry.title}</h2><p className="review-description">{entry.description}</p>
    <dl className="review-facts"><div><dt>ผู้สร้าง / ผู้เขียน</dt><dd>{entry.author}</dd></div><div><dt>ประเภทและหมวด</dt><dd>{kindLabels[entry.kind]} · {entry.category}</dd></div><div><dt>ส่งโดย</dt><dd>{submitter}</dd></div></dl>
    <div className="review-source"><h3>ตรวจต้นทาง</h3>
      {entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">เปิดโพสต์หรือแหล่งที่มา <ArrowUpRight size={14} /><small>{entry.sourceUrl}</small></a> : <p>ยังไม่มีลิงก์แหล่งที่มา — เพิ่มหรือส่งกลับให้เอเจนต์ตรวจสอบ</p>}
      {entry.url && <a href={entry.url} target="_blank" rel="noreferrer">เปิดเว็บไซต์{entry.kind === "game" ? "เกม" : "ต้นทาง"} <ArrowUpRight size={14} /><small>{entry.url}</small></a>}
      {context && <div className="review-context"><strong>รวบรวมผ่าน {context.provider}</strong>{context.runId && <small>Run ID: {context.runId}</small>}<p>{context.reason}</p><small>ข้อมูลประกอบการคัดเลือก ยังต้องตรวจสอบกับต้นทาง</small></div>}
    </div>
    {entry.body && <section className="review-body"><h3>รายละเอียดที่จะเผยแพร่</h3><p>{entry.body}</p></section>}
    {context?.signal && <section className="review-signal"><span className="eyebrow">COMMUNITY QUESTION → RESEARCH</span><h3>{context.signal.question}</h3><p>{context.signal.topic} · แนบหลักฐาน {context.signal.evidenceUrls.length} ลิงก์</p><p className="field-hint">จำนวนลิงก์ที่เอเจนต์แนบ ยังต้องตรวจว่าเป็นคนละโพสต์และถามปัญหาเดียวกันก่อนเรียกว่าคำถามพบบ่อย</p><div className="review-source">{context.signal.evidenceUrls.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer">หลักฐาน {i + 1} <ArrowUpRight size={14} /><small>{url}</small></a>)}</div><h3>แนวทางแก้จากแหล่งสากล</h3>{context.signal.solutions.length ? context.signal.solutions.map(solution => <div className="review-feedback" key={solution.url}><a className="text-link" href={solution.url} target="_blank" rel="noreferrer">{solution.title} <ArrowUpRight size={14} /></a><p>{solution.appliesWhen}</p><small>{solution.verification === "tested" ? "เอเจนต์ระบุว่าทดลองแล้ว" : "ตรวจเอกสาร ยังไม่ได้ทดลอง"} · ตรวจเมื่อ {solution.checkedAt}</small></div>) : <p>รอค้นและตรวจแหล่งอ้างอิงเพิ่มเติม</p>}<p className="field-hint">ส่วนนี้เป็นหลักฐานสำหรับผู้ตรวจ หากจะเผยแพร่คำตอบ ให้ใส่คำอธิบายและลิงก์อ้างอิงในเนื้อหาบทความด้วย</p></section>}
    {entry.image && <a className="text-link" href={entry.image} target="_blank" rel="noreferrer">เปิดภาพปกเพื่อตรวจสอบ <ArrowUpRight size={14} /></a>}
    {review && <div className="review-feedback"><strong>ผลตรวจครั้งล่าสุด · { { publish: "เผยแพร่", return: "ส่งกลับแก้ไข", reject: "ไม่รับรายการ" }[review.decision]}</strong><p>{review.note || "ไม่มีหมายเหตุเพิ่มเติม"}</p></div>}
    {entry.status === "pending" ? <div className="review-decision">
      <label>หมายเหตุถึงผู้ส่ง <span className="field-hint">จำเป็นเมื่อส่งกลับหรือไม่รับรายการ</span><textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น ขอเพิ่มลิงก์เกมจริงและเครดิตผู้สร้าง" /></label>
      <label className="checkbox"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />ฉันตรวจข้อมูล ลิงก์ และสิทธิ์ใช้ภาพแล้ว พร้อมเผยแพร่</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-actions"><button className="button primary" disabled={busy || !checked} onClick={() => act("publish")}><Check size={16} />ยืนยันเผยแพร่</button><button className="button" disabled={busy} onClick={() => act("return")}>ส่งกลับให้แก้</button><button className="button" disabled={busy} onClick={() => act("reject")}>ไม่รับรายการ</button></div>
      <p className="field-hint">ยืนยันแล้วจะแสดงบนเว็บทันที · ไม่รับรายการจะเก็บเข้าคลัง และเปิดกลับมาแก้ได้</p>
    </div> : <p className="review-feedback">รอเอเจนต์เตรียมงานและส่งตรวจ หรือกด “แก้ไขข้อมูล” เพื่อจัดการด้วยตัวเอง</p>}
  </article>;
}
