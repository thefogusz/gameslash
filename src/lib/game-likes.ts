import { z } from "zod";
import { consumeLimit, type Database } from "./model";

const id = z.string().regex(/^[a-z0-9-]{1,100}$/);
export const likeMutation = z.union([
  z.object({ id, liked: z.boolean() }).strict(),
  z.object({ importIds: z.array(id).max(3000) }).strict(),
]);

// shortcut: likes share the catalog snapshot; use a separate likes table before sustained traffic or D1's state row approaches 1.8 MB.
export function changeGameLikes(db: Database, visitor: string, input: z.infer<typeof likeMutation>, limitKey: string) {
  consumeLimit(db, `likes:${limitKey}`, 120, 60_000);
  const liked = new Set(db.gameLikes[visitor] || []);
  const published = new Set(db.entries.filter(e => e.kind === "game" && e.status === "published").map(e => e.id));
  if ("importIds" in input) {
    for (const id of input.importIds) if (published.has(id)) liked.add(id);
  } else if (input.liked) {
    if (!published.has(input.id)) throw new Error("ไม่พบเกมที่เผยแพร่นี้");
    liked.add(input.id);
  } else {
    liked.delete(input.id);
  }
  if (liked.size > 3000) throw new Error("เก็บถูกใจได้สูงสุด 3,000 เกม");
  if (liked.size) db.gameLikes[visitor] = [...liked];
  else delete db.gameLikes[visitor];
}

export function gameLikeCounts(db: Database) {
  const counts: Record<string, number> = Object.create(null);
  for (const entry of db.entries) if (entry.kind === "game") counts[entry.id] = 0;
  for (const ids of Object.values(db.gameLikes))
    for (const id of new Set(ids)) counts[id] = (counts[id] || 0) + 1;
  return counts;
}
