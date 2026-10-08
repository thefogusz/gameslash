import type { Entry } from "./model";

export const likesStorageKey = "gameslash:likes:v1";
export function readLikedIds(raw: string | null): string[] {
  try {
    const data = JSON.parse(raw || "null");
    if (data?.version !== 1 || !Array.isArray(data.likedIds)) return [];
    return [...new Set<string>(data.likedIds.filter((id: unknown): id is string =>
      typeof id === "string" && /^[a-z0-9-]{1,100}$/.test(id)).slice(0, 3000))];
  } catch { return []; }
}

export function recommendGames(entries: Entry[], likedIds: string[], featuredIds: string[]) {
  const games = entries.filter(e => e.kind === "game" && e.status === "published");
  const likes = new Set(likedIds);
  const liked = games.filter(e => likes.has(e.id));
  const genericTags = new Set(["AI ในเกม", "สร้างด้วย AI"]);
  const scored = games.filter(e => !likes.has(e.id)).map(entry => ({
    entry,
    score: liked.reduce((score, favorite) => score
      + (entry.category === favorite.category ? 3 : 0)
      + entry.tags.filter(tag => !genericTags.has(tag) && favorite.tags.includes(tag)).length, 0),
  }));
  const rank = (id: string) => { const index = featuredIds.indexOf(id); return index < 0 ? featuredIds.length : index; };
  return scored.sort((a, b) => b.score - a.score || rank(a.entry.id) - rank(b.entry.id))
    .slice(0, 5);
}
