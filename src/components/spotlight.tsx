"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles, TrendingUp, Users } from "lucide-react";
import type { Entry, Layout } from "@/lib/model";
import { discoveryCollections } from "@/lib/spotlights";
import { Cover } from "./cover";
import { LikeButton, useGamePreferences } from "./game-preferences";
export function Spotlight({ entries, layout }: { entries: Entry[]; layout: Layout }) {
  const { likedIds, ready, error } = useGamePreferences();
  const games = entries.filter(e => e.kind === "game" && e.status === "published");
  const { manual, trending } = discoveryCollections(entries, layout);
  const liked = games.filter(e => likedIds.includes(e.id));
  const groups = [
    ...(manual.length ? manual : [{ id: "auto-curated", title: "คัดสรร", badge: "เกมแนะนำ", entries: games.slice(0, 5) }]),
    { id: "auto-new", title: "มาใหม่", badge: "เพิ่มล่าสุดใน Gameslash", entries: [...games].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,5) },
    { id: "auto-trending", title: "ติดเทรนด์", badge: "ติดเทรนด์ · ทีมงานคัดเลือก", entries: trending?.entries || [] },
    // ponytail: connect a comparable player-count source before ranking; editorial picks cannot substitute for statistics.
    { id: "auto-most-played", title: "ผู้เล่นมากที่สุด", badge: "ผู้เล่นมากที่สุด", entries: [] as Entry[] },
    { id: "liked", title: `ถูกใจ${ready ? ` (${liked.length})` : ""}`, badge: "เกมที่คุณถูกใจ", entries: liked.slice(0,5) },
  ];
  const [groupId, setGroupId] = useState("");
  const group = groups.find(g => g.id === groupId) || groups[0];
  if (!games.length) return null;
  const note = group.id === "liked" ? "ถูกใจเก็บเฉพาะเบราว์เซอร์นี้ ไม่ต้องสมัครสมาชิก หากล้างข้อมูลเว็บไซต์ รายการนี้จะหายไป"
    : group.id === "auto-new" ? "เรียงตามวันที่เพิ่มเข้าคลัง Gameslash ล่าสุด ไม่ใช่วันเปิดตัวเกม"
    : group.id === "auto-trending" ? "เกมที่ทีมงานคัดเลือกสำหรับชุดติดเทรนด์"
    : group.id === "auto-most-played" ? "อันดับนี้จะใช้ข้อมูลจำนวนผู้เล่นที่มีแหล่งอ้างอิงและช่วงเวลาตรงกัน"
    : /popular|trending|ยอดนิยม|มาแรง|เทรน/i.test(group.title) ? "ชุดเด่นที่ผู้ดูแลคัดเลือก ไม่ใช่อันดับจากยอดไลก์หรือจำนวนผู้เล่น" : "";
  const empty = group.id === "auto-trending"
    ? { title: "กำลังคัดเกมติดเทรนด์", description: "เมื่อทีมงานเพิ่มเกมในชุดนี้ คุณจะเห็นได้ที่นี่", icon: <TrendingUp size={36} className="empty-heart" aria-hidden="true" /> }
    : group.id === "auto-most-played"
    ? { title: "ยังไม่มีข้อมูลจำนวนผู้เล่น", description: "จะแสดงอันดับเมื่อมีสถิติที่ตรวจสอบและเปรียบเทียบกันได้", icon: <Users size={36} className="empty-heart" aria-hidden="true" /> }
    : group.id === "liked"
    ? { title: "ยังไม่มีเกมที่ถูกใจ", description: "กดหัวใจบนการ์ดเกม แล้วกลับมาดูได้ที่นี่", icon: <HeartEmpty /> }
    : { title: "ยังไม่มีเกมในชุดนี้", description: "ลองเลือกชุดอื่นหรือค้นหาเกมทั้งหมด", icon: <HeartEmpty /> };
  return <section className="spotlight" aria-label="ชุดเกมเด่น">
    <div className="spotlight-tabs" aria-label="เลือกชุดเกมเด่น">{groups.map(g => <button key={g.id} aria-pressed={g.id === group.id} onClick={() => setGroupId(g.id)}>{g.title}</button>)}</div>
    {note && <div className="spotlight-note"><p>{note}</p>{group.id === "liked" && liked.length > 0 && <Link href="/games?liked=1">ดูถูกใจทั้งหมด ({liked.length})</Link>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {group.entries.length > 0 ? <Slides key={`${group.id}:${group.entries.map(e => e.id).join()}`} entries={group.entries} badge={group.badge} />
      : <div className="spotlight-empty">{empty.icon}<h2>{empty.title}</h2><p>{empty.description}</p><Link className="button" href="/games">ค้นหาเกม</Link></div>}
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
        <Cover entry={entry} /><div className="feature-shade" /><div className="feature-copy"><span className="feature-category">{entry.category}</span><h3>{entry.title}</h3><p>{entry.description}</p></div>
      </button>)}</div>
    </div>
    {entries.length > 1 && <div className="spotlight-controls"><span aria-live={playing ? "off" : "polite"}>{index + 1} / {entries.length} · {active.title}</span><div>
      <button className="icon-button" aria-label="สไลด์ก่อนหน้า" onClick={() => { setIndex((index + entries.length - 1) % entries.length); setPlaying(false); }}><ArrowLeft size={16} /></button>
      <button className="icon-button" aria-label={playing ? "หยุดสไลด์อัตโนมัติ" : "เล่นสไลด์อัตโนมัติ"} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button className="icon-button" aria-label="สไลด์ถัดไป" onClick={() => { setIndex((index + 1) % entries.length); setPlaying(false); }}><ArrowRight size={16} /></button>
    </div></div>}
  </div>;
}
