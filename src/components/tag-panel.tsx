"use client";
import { useState } from "react";
import type { Database } from "@/lib/model";
import { gameTags, findGameTag, tagKey, tagSource, tagSourceDate } from "@/lib/game-tags";
import type { tagResolutionSchema } from "@/lib/tag-service";
import type { z } from "zod";

export function TagPanel({ data, busy, resolve, openAgents, onDirty }: {
  data: Pick<Database, "customTags" | "tagRequests" | "entries">;
  busy: boolean;
  resolve: (resolution: z.infer<typeof tagResolutionSchema>) => Promise<void>;
  openAgents: () => void;
  onDirty: () => void;
}) {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState(false);
  const tags = gameTags(data);
  const requests = data.tagRequests.filter(r => history || r.status === "pending");
  const matches = tags.filter(t => tagKey(`${t.name} ${t.thai}`).includes(tagKey(query)));
  return <div className="import-panel">
    <div className="studio-heading"><div><span className="eyebrow">GAME TAGS</span><h1>คลังแท็กเกม</h1><p>{tags.length} แท็ก · รอตรวจ {data.tagRequests.filter(r => r.status === "pending").length} คำขอ</p></div></div>
    <div className="import-guide"><h2>คำขอใหม่ให้ Dots ตรวจเกมก่อน</h2><p>เปิดสิทธิ์ตรวจแท็กให้คีย์ของ Dots แล้วให้เอเจนต์อ่านคิวผ่าน MCP ตรวจเกมและแนบหลักฐานก่อนเพิ่มแท็กหรือจับคู่แท็กเดิม เกมยังรอคุณยืนยันเผยแพร่</p><p>หน้านี้เก็บคิวงานไว้ การตรวจจะเริ่มเมื่อคุณสั่ง Dots ที่เชื่อมต่อแล้วให้ทำงาน</p><button className="button" onClick={openAgents}>จัดการสิทธิ์ Dots</button></div>
    <h2>คำขอแท็ก</h2><label className="checkbox"><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} />แสดงคำขอที่จัดการแล้วด้วย</label>
    <div className="tag-request-list">{requests.length ? requests.map(request => {
      const entry = data.entries.find(e => e.id === request.entryId);
      const active = entry && ["draft", "pending"].includes(entry.status);
      return <details className="tag-suggestion" key={request.id}><summary>{request.name} · {entry?.title || "ไม่พบเกม"} · {{ pending: "รอ Dots ตรวจ", added: "เพิ่มแล้ว", mapped: "ใช้แท็กเดิม", rejected: "ไม่รับแท็ก" }[request.status]}</summary>
        <p>{request.reason}</p>{entry && <a className="text-link" href={entry.url} target="_blank" rel="noreferrer">เปิดเว็บไซต์เกม ↗</a>}
        {request.resolution ? <div><p>{request.resolution.reason}</p><p>ตรวจโดย {request.resolution.actor} · {new Date(request.resolution.at).toLocaleString("th-TH")}</p>{request.resolution.evidenceUrls.map(url => <p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}</div> : active ? <form className="entry-form" onChangeCapture={onDirty} onSubmit={async event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const decision = String(form.get("decision")) as "add" | "map" | "reject";
          const name = String(form.get("tag"));
          try { await resolve({ requestId: request.id, expectedUpdatedAt: entry.updatedAt, decision, name: name || undefined, existingTagId: findGameTag(tags, name)?.id, reason: String(form.get("reason")), evidenceUrls: [String(form.get("evidence"))] }); } catch { /* Admin displays the error. */ }
        }}>
          <p>ผู้ดูแลตรวจแทนได้: เปิดเกมและตรวจหลักฐานก่อนสรุปผล</p>
          <label>ผลการตรวจ<select name="decision"><option value="map">ใช้แท็กเดิมในคลัง</option><option value="add">เพิ่มแท็กใหม่ที่ตรวจแล้ว</option><option value="reject">ไม่รับแท็กนี้</option></select></label>
          <label>ชื่อแท็กเดิม หรือชื่อใหม่ที่ตรวจแล้ว<input name="tag" list="registered-game-tags" maxLength={60} defaultValue={request.name} /></label>
          <label>เหตุผลจากการตรวจ<textarea name="reason" minLength={20} maxLength={1000} required rows={3} /></label>
          <label>ลิงก์หลักฐาน<input name="evidence" type="url" required maxLength={2000} defaultValue={entry.url} /></label>
          <button className="button primary" disabled={busy}>บันทึกผลตรวจแท็ก</button>
        </form> : <p>เกมนี้ถูกเก็บเข้าคลังหรือเผยแพร่แล้ว จึงตรวจเพิ่มไม่ได้</p>}
      </details>;
    }) : <div className="empty-state">ยังไม่มีคำขอแท็กที่รอตรวจ</div>}</div>
    <h2>ค้นหาแท็กในคลัง</h2><p className="field-hint">อิงรายการสาธารณะของ <a href={tagSource} target="_blank" rel="noreferrer">Steam</a> ณ {tagSourceDate} พร้อมแท็กเฉพาะ Gameslash</p>
    <div className="entry-form"><label>ชื่อไทยหรืออังกฤษ<input value={query} onChange={e => setQuery(e.target.value)} placeholder="เช่น แฟนตาซี, Puzzle, Co-op" /></label></div>
    <p role="status">พบ {matches.length} แท็ก{matches.length > 60 ? " · แสดง 60 แท็กแรก พิมพ์เพื่อค้นหาเพิ่ม" : ""}</p>
    <div className="tag-catalog">{matches.slice(0, 60).map(tag => <div key={tag.id}><strong>{tag.thai}</strong><span>{tag.name}</span></div>)}</div>
    <datalist id="registered-game-tags">{tags.map(tag => <option key={tag.id} value={tag.name}>{tag.thai}</option>)}</datalist>
  </div>;
}
