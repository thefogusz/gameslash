"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import type { Entry, Layout } from "@/lib/model";
import { spotlightGroups } from "@/lib/spotlights";
import { Cover } from "./cover";
import { LikeButton, useGamePreferences } from "./game-preferences";
import { recommendGames } from "@/lib/game-preferences";
export function Spotlight({ entries, layout }: { entries: Entry[]; layout: Layout }) {
  const { likedIds, ready, error } = useGamePreferences();
  const games = entries.filter(e => e.kind === "game" && e.status === "published");
  const manual = spotlightGroups(entries, layout).filter(g => !["มาใหม่", "ใหม่ล่าสุด", "สำหรับคุณ", "ถูกใจ"].includes(g.title.trim()));
  const recommended = recommendGames(games, likedIds, layout.featuredIds.length ? layout.featuredIds : manual[0]?.entryIds || []);
  const liked = games.filter(e => likedIds.includes(e.id));
  const groups = [
    ...(manual.length ? manual : [{ id: "auto-curated", title: "คัดสรร", badge: "เกมแนะนำ", entries: games.slice(0, 5) }]),
    { id: "auto-new", title: "มาใหม่", badge: "เพิ่งเพิ่มใน Gameslash", entries: [...games].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5) },
    { id: "personal", title: "สำหรับคุณ", badge: "แนะนำสำหรับคุณ", entries: recommended.map(item => item.entry) },
    { id: "liked", title: `ถูกใจ${ready ? ` (${liked.length})` : ""}`, badge: "เกมที่คุณถูกใจ", entries: liked.slice(0,5) },
  ];
  const [groupId, setGroupId] = useState("");
  const group = groups.find(g => g.id === groupId) || (liked.length ? groups.find(g => g.id === "personal") : undefined) || groups[0];
  if (!games.length) return null;
  const note = group.id === "personal"
    ? !ready ? "กำลังอ่านความชอบจากเบราว์เซอร์นี้…" : !liked.length ? "กดหัวใจบนเกมที่ชอบ เพื่อเริ่มแนะนำเกมตามแนวของคุณ" : !recommended.length ? "เกมที่คุณเก็บไว้ยังเปิดดูได้ในแท็บถูกใจ" : recommended.some(item => item.score > 0) ? "เรียงจากแนวเกมและแท็กที่คล้ายกับเกมที่คุณถูกใจ" : "ยังไม่มีเกมแนวเดียวกันเพิ่ม ลองค้นพบเกมอื่นที่คัดสรรให้"
    : group.id === "liked" ? "ถูกใจเก็บเฉพาะเบราว์เซอร์นี้ ไม่ต้องสมัครสมาชิก หากล้างข้อมูลเว็บไซต์ รายการนี้จะหายไป"
    : group.id === "auto-new" ? "เกมที่เพิ่งเพิ่มเข้าคลัง Gameslash ไม่ใช่วันเปิดตัวเกม"
    : /popular|trending|ยอดนิยม|มาแรง|เทรน/i.test(group.title) ? "ชุดเด่นที่ผู้ดูแลคัดเลือก ไม่ใช่อันดับจากยอดไลก์หรือจำนวนผู้เล่น" : "เกมเด่นที่คัดสรรให้ลองค้นพบ · กดหัวใจเพื่อบอกแนวที่คุณชอบ";
  return <section className="spotlight" aria-label="ชุดเกมเด่น">
    <div className="spotlight-tabs" aria-label="เลือกชุดเกมเด่น">{groups.map(g => <button key={g.id} aria-pressed={g.id === group.id} onClick={() => setGroupId(g.id)}>{g.title}</button>)}</div>
    <div className="spotlight-note"><p>{note}</p>{group.id === "liked" && liked.length > 0 && <Link href="/games?liked=1">ดูถูกใจทั้งหมด ({liked.length})</Link>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {group.entries.length > 0 ? <Slides key={`${group.id}:${group.entries.map(e => e.id).join()}`} entries={group.entries} badge={group.badge} />
      : <div className="spotlight-empty"><HeartEmpty /><h2>{group.id === "liked" ? "ยังไม่มีเกมที่ถูกใจ" : "คุณถูกใจเกมที่มีทั้งหมดแล้ว"}</h2><p>{group.id === "liked" ? "กดหัวใจบนการ์ดเกม แล้วกลับมาดูได้ที่นี่" : "เมื่อมีเกมใหม่ เราจะใช้แนวที่คุณชอบช่วยแนะนำให้"}</p><Link className="button" href="/games">ค้นหาเกม</Link></div>}
  </section>;
}
function HeartEmpty() { return <span aria-hidden="true" className="empty-heart">♡</span>; }
function Slides({ entries, badge }: { entries: Entry[]; badge: string }) {
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(true), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) setPlaying(false);
    const stop = () => { if (motion.matches) setPlaying(false); };
    motion.addEventListener("change", stop);
    return () => motion.removeEventListener("change", stop);
  }, []);
  useEffect(() => {
    if (!playing || hovered || focused || entries.length < 2) return;
    const timer = setInterval(() => { if (!document.hidden) setIndex(i => (i + 1) % entries.length); }, 6000);
    return () => clearInterval(timer);
  }, [playing, hovered, focused, entries.length, index]);
  const active = entries[index];
  return <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }} aria-roledescription="carousel" aria-label={badge}>
    <div className={`spotlight-grid ${entries.length === 1 ? "single" : ""}`}>
      <div className="spotlight-main-wrap">
      <Link href={`/item/${active.id}`} className="feature-tile spotlight-main" key={active.id}>
        <Cover entry={active} priority /><div className="feature-shade" />
        <span className="feature-badge"><Sparkles size={12} />{badge}</span>
        <div className="feature-copy"><span className="feature-category">{active.category}</span><h2>{active.title}</h2><p>{active.description}</p></div>
      </Link>
      <LikeButton id={active.id} title={active.title} compact />
      </div>
      <div className="spotlight-thumbs">{entries.map((entry, i) => i === index ? null : <button key={entry.id} className="feature-tile" aria-label={`แสดง ${entry.title}`} onClick={() => { setIndex(i); setPlaying(false); }}>
        <Cover entry={entry} /><div className="feature-shade" /><div className="feature-copy"><span className="feature-category">{entry.category}</span><h3>{entry.title}</h3></div>
      </button>)}</div>
    </div>
    {entries.length > 1 && <div className="spotlight-controls"><span aria-live={playing ? "off" : "polite"}>{index + 1} / {entries.length} · {active.title}</span><div>
      <button className="icon-button" aria-label="สไลด์ก่อนหน้า" onClick={() => { setIndex((index + entries.length - 1) % entries.length); setPlaying(false); }}><ArrowLeft size={16} /></button>
      <button className="icon-button" aria-label={playing ? "หยุดสไลด์อัตโนมัติ" : "เล่นสไลด์อัตโนมัติ"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button className="icon-button" aria-label="สไลด์ถัดไป" onClick={() => { setIndex((index + 1) % entries.length); setPlaying(false); }}><ArrowRight size={16} /></button>
    </div></div>}
  </div>;
}
