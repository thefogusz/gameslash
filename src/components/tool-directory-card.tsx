import { ArrowUpRight } from "lucide-react";
import type { Entry } from "@/lib/model";
import { ToolPopularity } from "./tool-popularity";

export function ToolDirectoryCard({ entry }: { entry: Entry }) {
  const url = new URL(entry.url);
  const repository = url.hostname === "github.com" && !url.pathname.startsWith("/features/");
  return <article className="tool-directory-card" id={`tool-${entry.id}`}>
    <div className="tool-directory-card-heading"><h3>{entry.title}</h3><span>{entry.category}</span></div>
    <ToolPopularity popularity={entry.popularity} />
    <p>{entry.description}</p>
    <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`เปิด${repository ? " GitHub repo" : "เว็บ"} ${entry.title} (แท็บใหม่)`}>{repository ? "เปิด GitHub" : "เปิดเว็บ"} <ArrowUpRight size={15} aria-hidden="true" /></a>
  </article>;
}
