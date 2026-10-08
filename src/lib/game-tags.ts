import { z } from "zod";
import steamTags from "./steam-tags.json";

export const tagSource = "https://store.steampowered.com/tag/browse/";
export const tagSourceDate = "2026-10-08";
export const tagName = z.string().trim().min(2).max(60);
export const gameTagSchema = z.object({ id: z.string().max(100), name: tagName, thai: z.string().max(100) });
export type GameTag = z.infer<typeof gameTagSchema>;
const extras = ["AI ในเกม", "สร้างด้วย AI", "เว็บ", "PC", "macOS", "Linux", "Android", "iOS", "โอเพนซอร์ส", "บทสนทนา", "เล่าเรื่อง", "สร้างสรรค์", "ทดลอง"];
export const baseGameTags: GameTag[] = [...steamTags, ...extras.map((name, i) => ({ id: `gameslash:${i}`, name, thai: name }))];
export const tagKey = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
export function findGameTag(tags: GameTag[], value: string) {
  const key = tagKey(value);
  return tags.find(t => t.id === value || tagKey(t.name) === key) ?? tags.find(t => tagKey(t.thai) === key);
}
export function gameTags(db: { customTags: GameTag[] }) { return [...baseGameTags, ...db.customTags]; }
export const tagSuggestionSchema = z.object({ name: tagName, reason: z.string().trim().min(10).max(600) });
export type TagSuggestion = z.infer<typeof tagSuggestionSchema>;
export const tagSuggestionsSchema = z.array(tagSuggestionSchema).max(3).default([]);
export const tagRequestSchema = tagSuggestionSchema.extend({
  id: z.string().uuid(), entryId: z.string().max(100), createdAt: z.iso.datetime(),
  status: z.enum(["pending", "added", "mapped", "rejected"]),
  resolution: z.object({ tagId: z.string().max(100).optional(), reason: z.string().min(10).max(1000), evidenceUrls: z.array(z.string().url()).max(5), actor: z.string().max(100), at: z.iso.datetime() }).optional(),
});
