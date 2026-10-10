import type { Entry } from "./model";
import { matchesGamePlatform } from "./game-platforms";
import { newsPublicationAt } from "./news-publication";

export function rankedGameCategories(categories: string[], entries: Entry[]) {
  return categories.map((category, index) => ({
    category, index, count: entries.filter(e => e.kind === "game" && e.category === category).length,
  })).sort((a, b) => b.count - a.count);
}

export const toolWorkflowCategories = [
  "ไอเดียและออกแบบ", "เอนจินเกม", "สร้างเกมแบบไม่เขียนโค้ด", "เขียนโค้ด",
  "ภาพและอาร์ต", "สไปรต์และภาพ 2D", "โมเดล 3D", "แอนิเมชัน", "เสียงและเพลง", "คลังแอสเซ็ต", "บทสนทนาและเนื้อเรื่อง", "AI ในเกม", "ทดสอบเกม",
];

export function gameMakingTools(entries: Entry[]) {
  return entries.filter(e => e.kind === "tool" && e.category !== "เผยแพร่");
}

export const directorySorts = {
  curated: "ทีมงานแนะนำ",
  new: "เพิ่มเข้าเว็บล่าสุด",
  az: "ชื่อ ก–ฮ / A–Z",
} as const;

export function filterDirectory(entries: Entry[], filters: {
  kind: Entry["kind"]; query: string; category: string; tag: string; sort: string; platform?: string;
}, featuredIds: string[] = []) {
  const query = filters.query.trim().toLocaleLowerCase();
  const tools = filters.kind === "tool";
  const category = tools && filters.category === "เผยแพร่" ? "" : filters.category;
  return (tools ? gameMakingTools(entries) : entries).filter(e => e.kind === filters.kind
    && (filters.kind !== "game" || matchesGamePlatform(e.tags, filters.platform || ""))
    && (!category || e.category === category)
    && (tools || !filters.tag || e.tags.includes(filters.tag))
    && (!query || `${e.title} ${e.description} ${e.author} ${e.tags.join(" ")} ${e.category}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      if (filters.kind === "article") return Date.parse(newsPublicationAt(b) || b.createdAt) - Date.parse(newsPublicationAt(a) || a.createdAt);
      if (tools && filters.sort === "popularity") return (b.popularity?.score ?? 0) - (a.popularity?.score ?? 0);
      if (filters.sort === "az") return a.title.localeCompare(b.title, "th");
      if (filters.sort === "new") return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (filters.sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      const rank = (id: string) => { const index = featuredIds.indexOf(id); return index < 0 ? featuredIds.length : index; };
      return rank(a.id) - rank(b.id);
    });
}


/** Only populated game genres belong in public genre controls; metadata stays untouched. */
export function visibleGameCategories(categories: string[], entries: Entry[], selected = "") {
  const populated = new Set(entries.filter(e => e.kind === "game").map(e => e.category));
  return [...new Set([...categories, ...populated])].filter(category => populated.has(category) || category === selected);
}

/** Secondary genre changes preserve the game directory's current URL filters. */
export function gameGenreHref(category: string, currentQuery = "") {
  const params = new URLSearchParams(currentQuery);
  if (category) params.set("category", category);
  else params.delete("category");
  return `/games${params.size ? `?${params.toString()}` : ""}`;
}
