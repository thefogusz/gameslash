import { z } from "zod";
import { gameTags, findGameTag, tagName, tagSuggestionSchema, tagKey, type TagSuggestion } from "./game-tags";
import { publicUrl, consumeLimit, type Database, type Entry } from "./model";
import { ConflictError } from "./postgres-store";

export function validateGameTags(db: Database, entry: Entry, old?: Entry) {
  if (entry.kind !== "game") return;
  const tags = gameTags(db);
  entry.tags = [...new Set(entry.tags.map(value => {
    // Keep legacy values editable without promoting them into the shared registry.
    if (old?.kind === "game" && old.tags.includes(value)) return value;
    const tag = findGameTag(tags, value);
    if (!tag) throw new Error(`ไม่พบแท็ก “${value}” กรุณาเลือกจากคลังหรือเสนอแท็กใหม่`);
    return tag.name;
  }))];
  if (entry.status === "published" && db.tagRequests.some(r => r.entryId === entry.id && r.status === "pending"))
    throw new Error("มีแท็กที่รอ Dots ตรวจ กรุณาจัดการคำขอแท็กก่อนเผยแพร่");
}
export function requestGameTags(db: Database, entry: Entry, suggestions: TagSuggestion[]) {
  if (!suggestions.length) return;
  if (entry.kind !== "game" || !["draft", "pending"].includes(entry.status)) throw new Error("เสนอแท็กได้เฉพาะเกมที่ยังไม่เผยแพร่");
  for (const value of suggestions) {
    const suggestion = tagSuggestionSchema.parse(value);
    if (findGameTag(gameTags(db), suggestion.name)) throw new Error("มีแท็กนี้ในคลังแล้ว กรุณาเลือกแท็กเดิม");
    if (db.tagRequests.some(r => r.entryId === entry.id && r.status === "pending" && tagKey(r.name) === tagKey(suggestion.name))) continue;
    if (db.tagRequests.filter(r => r.entryId === entry.id && r.status === "pending").length >= 3 || db.tagRequests.length >= 9000) throw new Error("คำขอแท็กถึงขีดจำกัดแล้ว");
    db.tagRequests.push({ ...suggestion, id: crypto.randomUUID(), entryId: entry.id, createdAt: new Date().toISOString(), status: "pending" });
  }
}
export function requireTagAgent(db: Database, agentId: string) {
  const agent = db.agents.find(a => a.id === agentId && !a.revokedAt && Date.parse(a.expiresAt) > Date.now());
  if (!agent || (!agent.canManageTags && !agent.canManageSite)) throw new Error("เอเจนต์ไม่มีสิทธิ์ตรวจและเพิ่มแท็ก กรุณาให้ผู้ดูแลเปิดสิทธิ์ใน Console");
  return agent;
}
export const tagResolutionSchema = z.object({
  requestId: z.string().uuid(), expectedUpdatedAt: z.iso.datetime(),
  decision: z.enum(["add", "map", "reject"]), name: tagName.optional(), existingTagId: z.string().max(100).optional(),
  reason: z.string().trim().min(20).max(1000),
  evidenceUrls: z.array(z.string().max(2000).refine(publicUrl)).min(1).max(5),
});
export function resolveGameTag(db: Database, raw: z.infer<typeof tagResolutionSchema>, actor: string) {
  const input = tagResolutionSchema.parse(raw);
  const request = db.tagRequests.find(r => r.id === input.requestId);
  if (!request || request.status !== "pending") throw new ConflictError("คำขอแท็กถูกจัดการแล้วหรือไม่พบ กรุณาโหลดใหม่");
  const entry = db.entries.find(e => e.id === request.entryId);
  if (!entry || entry.kind !== "game" || !["draft", "pending"].includes(entry.status)) throw new Error("เกมนี้ไม่ได้อยู่ในคิวตรวจแล้ว");
  if (entry.updatedAt !== input.expectedUpdatedAt) throw new ConflictError("ข้อมูลเกมเปลี่ยนแล้ว กรุณาตรวจเกมล่าสุดก่อนสรุปแท็ก");
  let tag;
  if (input.decision === "map") {
    tag = findGameTag(gameTags(db), input.existingTagId || "");
    if (!tag) throw new Error("กรุณาเลือกแท็กเดิมจากคลัง");
  } else if (input.decision === "add") {
    if (!input.name) throw new Error("กรุณาใส่ชื่อแท็กที่ตรวจแล้ว");
    if (findGameTag(gameTags(db), input.name)) throw new Error("ชื่อแท็กนี้มีแล้ว ให้ใช้การจับคู่แท็กเดิม");
    if (db.customTags.length >= 1000) throw new Error("คลังแท็กเพิ่มเติมเต็มแล้ว");
    tag = { id: `custom:${crypto.randomUUID()}`, name: input.name, thai: input.name };
  }
  if (tag && !entry.tags.includes(tag.name) && entry.tags.length >= 20) throw new Error("เกมมี 20 แท็กแล้ว กรุณานำแท็กที่ไม่จำเป็นออกก่อน");
  consumeLimit(db, `tag-review:${actor}`, 60, 3600000);
  if (tag && input.decision === "add") db.customTags.push(tag);
  if (tag) entry.tags = [...new Set([...entry.tags, tag.name])];
  entry.updatedAt = new Date(Math.max(Date.now(), Date.parse(entry.updatedAt) + 1)).toISOString();
  request.status = input.decision === "add" ? "added" : input.decision === "map" ? "mapped" : "rejected";
  request.resolution = { ...(tag ? { tagId: tag.id } : {}), reason: input.reason, evidenceUrls: [...new Set(input.evidenceUrls)], actor, at: entry.updatedAt };
  db.activity.unshift({ id: crypto.randomUUID(), actor, action: `tag.${request.status}`, title: request.name, entryId: entry.id, at: entry.updatedAt });
  db.activity = db.activity.slice(0, 200);
  return request;
}
