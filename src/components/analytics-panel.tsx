"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { ConsoleSelect } from "./console-select";
import type { TrafficReport } from "@/lib/analytics";
import type { Entry } from "@/lib/model";

const dashboard = "https://vercel.com/kirdssadee-4203s-projects/gameslash/analytics";
const number = (value: number) => value.toLocaleString("th-TH");

export function AnalyticsPanel({ entries, likeCounts, onRefresh, refreshing }: { entries: Entry[]; likeCounts: Record<string, number>; onRefresh: () => void; refreshing: boolean }) {
  const [days, setDays] = useState("7"), [refresh, setRefresh] = useState(0);
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/analytics?days=${days}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "โหลดสถิติไม่ได้ กรุณาลองใหม่");
        if (!controller.signal.aborted) setReport(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "โหลดสถิติไม่ได้ กรุณาลองใหม่");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [days, refresh]);
  const peak = Math.max(1, ...(report?.daily.map(day => day.pageviews) ?? []));
  const likedGames = entries.filter(entry => entry.kind === "game" && (likeCounts[entry.id] || 0) > 0)
    .sort((a, b) => likeCounts[b.id] - likeCounts[a.id] || a.title.localeCompare(b.title, "th"));
  return (
    <section className="traffic-panel">
      <div className="studio-heading">
        <div><h1>ทราฟฟิคเว็บ</h1><p>สถิติการเข้าชมเว็บจริงจาก Vercel Web Analytics</p></div>
        <a href={dashboard} target="_blank" rel="noopener noreferrer" className="button">ดูใน Vercel <ArrowUpRight size={15} /></a>
      </div>
      <div className="traffic-toolbar">
        <ConsoleSelect label="ช่วงเวลาสถิติ" value={days} onChange={setDays}><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option></ConsoleSelect>
        <span className="status status-published">เว็บจริง · Production</span>
        <button className="button" disabled={loading || refreshing} onClick={() => { setRefresh(value => value + 1); onRefresh(); }}><RefreshCw size={15} className={loading || refreshing ? "spin" : ""} />โหลดสถิติล่าสุด</button>
      </div>
      {loading && <div className="empty-state" role="status">กำลังโหลดสถิติ…</div>}
      {error && <div className="form-error" role="alert">{error} · สามารถดูข้อมูลใน Vercel ได้ระหว่างนี้</div>}
      {report && <>
        <dl className="traffic-totals">
          <div><dt>ผู้เข้าชม <small>Visitors</small></dt><dd>{number(report.visitors)}</dd></div>
          <div><dt>ยอดเปิดหน้าเว็บ <small>Page Views</small></dt><dd>{number(report.pageviews)}</dd></div>
        </dl>
        <section className="traffic-card"><h2>ยอดเปิดหน้าเว็บรายวัน</h2><p className="field-hint">แบ่งวันตาม UTC · ข้อมูลอัปเดตประมาณทุกนาที</p>
          {report.pageviews === 0 && <p role="status">ยังไม่มีการเข้าชมในช่วงเวลานี้</p>}
          <ol className="traffic-chart" data-days={report.days} aria-label="ยอดเปิดหน้าเว็บต่อวัน">
            {report.daily.map(day => <li key={day.date} title={`${day.date}: ${day.pageviews} ครั้ง จากผู้เข้าชม ${day.visitors} ราย`}>
              <span className="traffic-count" aria-hidden="true">{number(day.pageviews)}</span>
              <div className="traffic-bar" aria-hidden="true"><span style={{ height: `${100 * day.pageviews / peak}%` }} /></div>
              <time dateTime={day.date} aria-hidden="true">{day.date.slice(8)}/{day.date.slice(5, 7)}</time>
              <span className="sr-only">{day.date}: {day.pageviews} ครั้ง จากผู้เข้าชม {day.visitors} ราย</span>
            </li>)}
          </ol>
        </section>
        <div className="traffic-breakdowns">
          {([{ title: "หน้าที่มีคนดู", rows: report.pages }, { title: "แหล่งที่มา", rows: report.referrers }]).map(group => <section className="traffic-card" key={group.title}>
            <h2>{group.title}</h2>
            {!group.rows.length ? <p className="field-hint">ยังไม่มีข้อมูลในช่วงเวลานี้</p> : <table>
              <thead><tr><th scope="col">{group.title === "แหล่งที่มา" ? "แหล่งที่มา" : "หน้าเว็บ"}</th><th scope="col">ผู้เข้าชม</th><th scope="col">เปิดหน้า</th></tr></thead>
              <tbody>{group.rows.map((row, index) => <tr key={index}><td>{row.label}</td><td>{number(row.visitors)}</td><td>{number(row.pageviews)}</td></tr>)}</tbody>
            </table>}
          </section>)}
        </div>
        <p className="field-hint">แสดงกลุ่มอันดับต้น ๆ และกลุ่มอื่น ๆ ตาม Vercel · ผู้เข้าชมอาจอยู่ได้หลายกลุ่ม จึงไม่ควรบวกแต่ละแถวเป็นยอดรวม</p>
      </>}
      <section className="traffic-card traffic-likes" aria-labelledby="traffic-likes-title">
        <h2 id="traffic-likes-title">เกมที่ถูกกดไลค์</h2>
        <p className="field-hint">ยอดหัวใจปัจจุบันจากระบบ Gameslash · รวมทุกช่วงเวลา และหักการเลิกถูกใจแล้ว · เรียงยอดมากที่สุด</p>
        {!likedGames.length ? <p role="status">ยังไม่มีเกมที่ถูกกดไลค์</p> : <table>
          <thead><tr><th scope="col">เกม</th><th scope="col">หัวใจ</th></tr></thead>
          <tbody>{likedGames.map(entry => <tr key={entry.id}>
            <td>{entry.status === "published" ? <Link href={`/item/${entry.id}`} target="_blank" rel="noopener noreferrer">{entry.title}</Link> : <>{entry.title} <small>(ไม่ได้เผยแพร่)</small></>}</td>
            <td>{number(likeCounts[entry.id])}</td>
          </tr>)}</tbody>
        </table>}
      </section>
    </section>
  );
}
