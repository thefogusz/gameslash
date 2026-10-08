import { Star } from "lucide-react";
import type { Entry } from "@/lib/model";

export function ToolPopularity({ popularity }: { popularity: Entry["popularity"] }) {
  if (!popularity) return <span className="popularity-unrated">ยังไม่ประเมินความนิยม</span>;
  return <details className="tool-popularity">
    <summary aria-label={`ความนิยม ${popularity.score} จาก 5 ดาว · ดูเหตุผลและแหล่งข้อมูล`}>
      <span className="popularity-stars" aria-hidden="true">{[1,2,3,4,5].map(star => <Star key={star} size={15} className={star <= popularity.score ? "filled" : ""} />)}</span>
      <span>ความนิยม <strong>{popularity.score}/5</strong></span>
    </summary>
    <div className="popularity-evidence">
      <p>{popularity.reason}</p>
      <p>Gameslash ประเมิน · ตรวจเมื่อ {popularity.checkedAt.split("-").reverse().join("/")}</p>
      <ul>{popularity.sources.map((url, i) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">แหล่งข้อมูล {i + 1} · {new URL(url).hostname}</a></li>)}</ul>
    </div>
  </details>;
}
