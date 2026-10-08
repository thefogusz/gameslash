"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import type { Entry, Layout } from "@/lib/model";
import { spotlightGroups } from "@/lib/spotlights";
import { Cover } from "./cover";
export function Spotlight({ entries, layout }: { entries: Entry[]; layout: Layout }) {
  const groups = spotlightGroups(entries, layout);
  const [groupId, setGroupId] = useState("");
  const group = groups.find(g => g.id === groupId) || groups[0];
  if (!group) return null;
  return <section className="spotlight" aria-label="เกมเด่นตามหมวด">
    <div className="spotlight-tabs" aria-label="เลือกชุดเกมเด่น">{groups.map(g => <button key={g.id} aria-pressed={g.id === group.id} onClick={() => setGroupId(g.id)}>{g.title}</button>)}</div>
    <Slides key={`${group.id}:${group.entries.map(e => e.id).join()}`} entries={group.entries} badge={group.badge} />
  </section>;
}
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
      <Link href={`/item/${active.id}`} className="feature-tile spotlight-main" key={active.id}>
        <Cover entry={active} priority /><div className="feature-shade" />
        <span className="feature-badge"><Sparkles size={12} />{badge}</span>
        <div className="feature-copy"><span className="feature-category">{active.category}</span><h2>{active.title}</h2><p>{active.description}</p></div>
      </Link>
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
