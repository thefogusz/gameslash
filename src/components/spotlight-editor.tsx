"use client";
import type { Entry, Layout } from "@/lib/model";
export function SpotlightEditor({ layout, entries, onChange }: { layout: Layout; entries: Entry[]; onChange: (layout: Layout) => void }) {
  const groups = layout.spotlights.length ? layout.spotlights : layout.featuredIds.length ? [{ id: "featured", title: "คัดสรร", badge: "เกมแนะนำ", entryIds: layout.featuredIds }] : [];
  const save = (spotlights: Layout["spotlights"]) => onChange({ ...layout, spotlights, featuredIds: [] });
  const games = entries.filter(e => e.kind === "game" && e.status === "published");
  return <><h3>สไลด์เกมเด่น</h3><p>แบ่งชุดได้สูงสุด 8 ชุด ชุดละ 5 เกม เปลี่ยนสไลด์ทุก 6 วินาที</p>
    <p className="field-hint">ชื่อชุดและป้ายเป็นการคัดสรรโดยผู้ดูแล หากใช้ “ผู้เล่นเยอะ” ควรมีข้อมูลต้นทางรองรับ</p>
    {groups.map((group, index) => <fieldset className="spotlight-editor-group" key={group.id}><legend>ชุดที่ {index + 1}</legend>
      <label>ชื่อชุด<input maxLength={40} value={group.title} onChange={e => save(groups.map(g => g.id === group.id ? { ...g, title: e.target.value } : g))} placeholder="มาแรง / มาใหม่" /></label>
      <label>ป้ายบนสไลด์<input maxLength={40} value={group.badge} onChange={e => save(groups.map(g => g.id === group.id ? { ...g, badge: e.target.value } : g))} placeholder="เกมแนะนำ" /></label>
      {Array.from({ length: 5 }, (_, i) => <label key={i}>เกมที่ {i + 1}<select value={group.entryIds[i] || ""} onChange={e => { const ids = [...group.entryIds]; ids[i] = e.target.value; save(groups.map(g => g.id === group.id ? { ...g, entryIds: ids.filter(Boolean) } : g)); }}>
        <option value="">ไม่แสดง</option>{games.map(game => <option key={game.id} value={game.id} disabled={group.entryIds.includes(game.id) && group.entryIds[i] !== game.id}>{game.title}</option>)}
      </select></label>)}
      <div className="spotlight-editor-actions"><button className="button" disabled={index === 0} onClick={() => { const next = [...groups]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; save(next); }}>เลื่อนขึ้น</button><button className="text-danger" onClick={() => save(groups.filter(g => g.id !== group.id))}>นำชุดนี้ออก</button></div>
    </fieldset>)}
    <button className="button" disabled={groups.length >= 8} onClick={() => save([...groups, { id: crypto.randomUUID(), title: "ชุดใหม่", badge: "เกมแนะนำ", entryIds: [] }])}>เพิ่มชุดสไลด์</button>
  </>;
}
