"use client";
import { useEffect, useState } from "react";
import type { Database } from "@/lib/model";

type Agent = Omit<Database["agents"][number], "tokenHash">;
export function AgentPanel({ agents, busy, mutate }: {
  agents: Agent[];
  busy: boolean;
  mutate: (body: Record<string, unknown>, message: string) => Promise<{ issuedToken?: string }>;
}) {
  const [endpoint, setEndpoint] = useState("/api/mcp");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const activeAgents = agents.filter(agent => !agent.revokedAt && Date.parse(agent.expiresAt) > Date.now());
  const inactiveAgents = agents.filter(agent => agent.revokedAt || Date.parse(agent.expiresAt) <= Date.now());
  useEffect(() => { setEndpoint(`${window.location.origin}/api/mcp`); }, []);
  return <div className="import-panel agent-panel">
    <div className="studio-heading"><div>
      <span className="eyebrow">AGENT CONNECTIONS</span>
      <h1>เอเจนต์และการเชื่อมต่อ</h1>
      <p>เชื่อม Dots หรือไคลเอนต์ MCP ผ่าน HTTP และ Bearer token</p>
    </div></div>
    <div className="import-columns">
      <form onSubmit={async e => {
        e.preventDefault();
        const form = e.currentTarget;
        const values = new FormData(form);
        setToken(""); setCopied(false);
        try {
          const result = await mutate({ action: "create_agent", name: values.get("name"), canWriteDrafts: values.get("write") === "on", canManageTags: values.get("tags") === "on", canManageSite: values.get("site") === "on" }, "สร้างคีย์แล้ว เก็บคีย์ก่อนออกจากหน้านี้");
          setToken(result.issuedToken || ""); form.reset();
        } catch { /* Parent displays the request error. */ }
      }}>
        <label>ชื่อเอเจนต์<input name="name" placeholder="เช่น Dots รวบรวมเกม" minLength={2} maxLength={60} required /></label>
        <label className="checkbox"><input name="write" type="checkbox" defaultChecked />สร้างและแก้ไขฉบับร่างของตัวเองได้</label>
        <label className="checkbox"><input name="tags" type="checkbox" />ตรวจคำขอแท็กจากผู้ส่งเกมและเพิ่มแท็กเข้าคลังได้ (สำหรับ Dots)</label>
        <label className="checkbox"><input name="site" type="checkbox" />จัดการเว็บผ่าน MCP: แก้ไขและเผยแพร่เกม เครื่องมือ ข่าว และหน้าแรกได้</label>
        <p>สิทธิ์จัดการเว็บเผยแพร่ได้ทันที เปิดให้เฉพาะเอเจนต์ที่คุณเชื่อถือ; คีย์ทั่วไปยังส่งฉบับร่างเข้าคิวตรวจ</p>
        <button className="button primary" disabled={busy}>สร้างคีย์เชื่อมต่อ</button>
        {token && <div className="agent-token" role="status">
          <label>คีย์นี้แสดงครั้งเดียว<input value={token} readOnly autoComplete="off" spellCheck={false} /></label>
          <p>คีย์มีอายุ 90 วัน เก็บไว้ในช่อง Secret ของไคลเอนต์</p>
          <div className="studio-actions">
            <button type="button" className="button" onClick={async () => {
              try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setCopied(false); }
            }}>{copied ? "คัดลอกแล้ว" : "คัดลอกคีย์"}</button>
            <button type="button" className="button" onClick={() => setToken("")}>ซ่อนคีย์</button>
          </div>
        </div>}
      </form>
      <div className="import-guide">
        <h2>ข้อมูลสำหรับเชื่อมต่อ</h2>
        <label>MCP URL<input value={endpoint} readOnly /></label>
        <p>Transport: Streamable HTTP<br />Header: <code>Authorization: Bearer YOUR_AGENT_TOKEN</code></p>
        <p>คีย์ทั่วไป: ค้นรายการเดิม → สร้างฉบับร่าง → ส่งตรวจ · คีย์จัดการเว็บ: แก้ไข เผยแพร่ และจัดหน้าเว็บได้โดยตรง</p>
        <p>ใช้ได้กับไคลเอนต์ที่กำหนด Bearer token เองได้ การเชื่อมผ่าน OAuth ยังไม่รองรับ</p>
      </div>
    </div>
    <h2>คีย์ที่ใช้งานอยู่ ({activeAgents.length})</h2>
    <div className="agent-list">{activeAgents.length ? activeAgents.map(agent => {
      return <div className="agent-row" key={agent.id}>
        <div><strong>{agent.name}</strong><p>{agent.canManageSite ? "จัดการเว็บ" : agent.canWriteDrafts ? "อ่านและเตรียมฉบับร่าง" : "อ่านอย่างเดียว"} · หมดอายุ {new Date(agent.expiresAt).toLocaleDateString("th-TH")}</p></div>
        <label className="checkbox"><input type="checkbox" checked={agent.canManageTags || agent.canManageSite} disabled={busy || agent.canManageSite} onChange={async e => {
          try { await mutate({ action: "agent_tag_permission", id: agent.id, enabled: e.target.checked }, "อัปเดตสิทธิ์ตรวจแท็กแล้ว"); } catch { /* Parent displays errors. */ }
        }} />ตรวจและเพิ่มแท็ก</label>
        <label className="checkbox"><input type="checkbox" checked={agent.canManageSite} disabled={busy} onChange={async e => {
          try { await mutate({ action: "agent_site_permission", id: agent.id, enabled: e.target.checked }, "อัปเดตสิทธิ์จัดการเว็บแล้ว"); } catch { /* Parent displays errors. */ }
        }} />จัดการและเผยแพร่เว็บ</label>
        <button className="button" disabled={busy} onClick={async () => {
          try { await mutate({ action: "revoke_agent", id: agent.id }, "ยกเลิกคีย์แล้ว เอเจนต์ใช้คีย์นี้ไม่ได้อีก"); setToken(""); } catch { /* Parent displays the request error. */ }
        }}>ยกเลิกคีย์</button>
      </div>;
    }) : <div className="empty-state">ไม่มีคีย์ที่ใช้งานอยู่</div>}</div>
    {inactiveAgents.length > 0 && <details><summary>คีย์ที่ยกเลิกหรือหมดอายุ ({inactiveAgents.length})</summary><div className="agent-list">{inactiveAgents.map(agent => <div className="agent-row" key={agent.id}><div><strong>{agent.name}</strong><p>{agent.revokedAt ? "ยกเลิกแล้ว" : "หมดอายุแล้ว"}</p></div></div>)}</div></details>}
  </div>;
}
const actions: Record<string, string> = {
  "review.publish": "ยืนยันเผยแพร่", "review.return": "ส่งกลับให้แก้", "review.reject": "ไม่รับรายการ",
  "entry.draft": "บันทึกฉบับร่าง", "entry.pending": "ส่งเข้าคิวตรวจ", "entry.published": "เผยแพร่รายการ",
  "entry.archived": "เก็บเข้าคลัง", "entry.import": "นำเข้ารายการ", "entry.agent_draft": "เตรียมฉบับร่าง",
  "layout.published": "เผยแพร่หน้าเว็บ", "layout.draft": "บันทึกหน้าฉบับร่าง",
  "tag.added": "เพิ่มแท็กที่ตรวจแล้ว", "tag.mapped": "จับคู่แท็กเดิม", "tag.rejected": "ไม่รับแท็ก", "agent.tag_permission": "เปลี่ยนสิทธิ์แท็ก",
  "agent.site_permission": "เปลี่ยนสิทธิ์จัดการเว็บ",
  "agent.created": "สร้างคีย์", "agent.revoked": "ยกเลิกคีย์",
};
export function ActivityPanel({ activity }: { activity: Database["activity"] }) {
  return <div className="import-panel">
    <div className="studio-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h1>ประวัติล่าสุด</h1><p>การจัดการโดยคุณและเอเจนต์ 200 รายการล่าสุด เริ่มบันทึกตั้งแต่เปิดใช้ระบบนี้</p></div></div>
    <div className="agent-list">{activity.length ? activity.map(item => <div className="agent-row" key={item.id}>
      <div><strong>{actions[item.action] || item.action} · {item.title}</strong><p>{item.actor}</p></div>
      <time dateTime={item.at}>{new Date(item.at).toLocaleString("th-TH")}</time>
    </div>) : <div className="empty-state">ยังไม่มีการจัดการล่าสุด</div>}</div>
  </div>;
}
