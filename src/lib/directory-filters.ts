import type { Entry } from "./model";

export const toolWorkflowCategories = [
  "ไอเดียและออกแบบ", "เอนจินเกม", "สร้างเกมแบบไม่เขียนโค้ด", "เขียนโค้ด",
  "ภาพและอาร์ต", "โมเดล 3D", "แอนิเมชัน", "เสียงและเพลง", "คลังแอสเซ็ต", "AI ในเกม", "ทดสอบเกม",
];

export function gameMakingTools(entries: Entry[]) {
  return entries.filter(e => e.kind === "tool" && e.category !== "เผยแพร่");
}

export const directorySorts = {
  curated: "แนะนำก่อน",
  new: "เพิ่มล่าสุด",
  updated: "อัปเดตล่าสุด",
  oldest: "เพิ่มก่อน",
  az: "ชื่อ A–Z",
} as const;

export function filterDirectory(entries: Entry[], filters: {
  kind: Entry["kind"]; query: string; category: string; tag: string; sort: string;
}, featuredIds: string[] = []) {
  const query = filters.query.trim().toLocaleLowerCase();
  const tools = filters.kind === "tool";
  const category = tools && filters.category === "เผยแพร่" ? "" : filters.category;
  return (tools ? gameMakingTools(entries) : entries).filter(e => e.kind === filters.kind
    && (!category || e.category === category)
    && (tools || !filters.tag || e.tags.includes(filters.tag))
    && (!query || `${e.title} ${e.description} ${e.author} ${e.tags.join(" ")} ${e.category}`.toLocaleLowerCase().includes(query)))
    .sort((a, b) => {
      if (filters.sort === "az") return a.title.localeCompare(b.title, "th");
      if (filters.sort === "new") return b.createdAt.localeCompare(a.createdAt);
      if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (filters.sort === "updated") return b.updatedAt.localeCompare(a.updatedAt);
      const rank = (id: string) => { const index = featuredIds.indexOf(id); return index < 0 ? featuredIds.length : index; };
      return rank(a.id) - rank(b.id);
    });
}
