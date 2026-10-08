import { ArrowUpRight } from "lucide-react";
import type { Entry } from "@/lib/model";

export function ToolDirectoryCard({ entry }: { entry: Entry }) {
  return <article className="tool-directory-card" id={`tool-${entry.id}`}>
    <div className="tool-directory-card-heading"><h3>{entry.title}</h3><span>{entry.category}</span></div>
    <p>{entry.description}</p>
    <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`เปิดเว็บ ${entry.title} (แท็บใหม่)`}>เปิดเว็บ <ArrowUpRight size={15} aria-hidden="true" /></a>
  </article>;
}
