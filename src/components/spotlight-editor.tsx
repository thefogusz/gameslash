"use client";
import type { Entry, Layout } from "@/lib/model";
export function SpotlightEditor({ layout, entries, onChange }: { layout: Layout; entries: Entry[]; onChange: (layout: Layout) => void }) {
  const groups = layout.spotlights.length ? layout.spotlights : layout.featuredIds.length ? [{ id: "featured", title: "คัดสรร", badge: "เกมแนะนำ", entryIds: layout.featuredIds }] : [];
  const save = (spotlights: Layout["spotlights"]) => onChange({ ...layout, spotlights, featuredIds: [] });
  const games = entries.filter(e => e.kind === "game" && e.status === "published");
  const titles = ["คัดสรร", "มาแรง", "ยอดนิยม"];
  return <><h3>สไลด์เกมเด่น</h3><p>เลือกชุดเด่นและเกมที่ต้องการแนะนำ ชุดละไม่เกิน 5 เกม</p>
    <p className="field-hint">“มาใหม่”, “สำหรับคุณ” และ “ถูกใจ” จัดให้อัตโนมัติ หมวดเกม เช่น RPG อยู่ในตัวกรอง ไม่ใช้เป็นแท็บเกมเด่น</p>
    <p className="field-hint">มาแรงและยอดนิยมเป็นชุดที่ผู้ดูแลคัดเลือก พร้อมคำอธิบายบนหน้าเว็บ ไม่ใช่ยอดไลก์รวม ไลก์แต่ละคนเก็บในเบราว์เซอร์เท่านั้น</p>
    {groups.map((group, index) => <fieldset className="spotlight-editor-group" key={group.id}><legend>ชุดที่ {index + 1}</legend>
      <label>ชุดเกมเด่น<select value={group.title} onChange={e => save(groups.map(g => g.id === group.id ? { ...g, title: e.target.value } : g))}>
        {!titles.includes(group.title) && <option value={group.title} disabled>{group.title} — กรุณาเลือกชุดเด่น</option>}
        {titles.map(title => <option key={title} value={title} disabled={groups.some(g => g.id !== group.id && g.title === title)}>{title}</option>)}
      </select></label>
      <label>ป้ายบนสไลด์<input maxLength={40} value={group.badge} onChange={e => save(groups.map(g => g.id === group.id ? { ...g, badge: e.target.value } : g))} placeholder="เกมแนะนำ" /></label>
      {Array.from({ length: 5 }, (_, i) => <label key={i}>เกมที่ {i + 1}<select value={group.entryIds[i] || ""} onChange={e => { const ids = [...group.entryIds]; ids[i] = e.target.value; save(groups.map(g => g.id === group.id ? { ...g, entryIds: ids.filter(Boolean) } : g)); }}>
        <option value="">ไม่แสดง</option>{games.map(game => <option key={game.id} value={game.id} disabled={group.entryIds.includes(game.id) && group.entryIds[i] !== game.id}>{game.title}</option>)}
      </select></label>)}
      <div className="spotlight-editor-actions"><button className="button" disabled={index === 0} onClick={() => { const next = [...groups]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; save(next); }}>เลื่อนขึ้น</button><button className="text-danger" onClick={() => save(groups.filter(g => g.id !== group.id))}>นำชุดนี้ออก</button></div>
    </fieldset>)}
    <button className="button" disabled={groups.length >= 8 || titles.every(title => groups.some(g => g.title === title))} onClick={() => save([...groups, { id: crypto.randomUUID(), title: titles.find(title => !groups.some(g => g.title === title)) || "คัดสรร", badge: "ทีมงานคัดเลือก", entryIds: [] }])}>เพิ่มชุดสไลด์</button>
  </>;
}
