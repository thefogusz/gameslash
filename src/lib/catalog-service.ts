import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { tagSuggestionsSchema } from "./game-tags";
import { requestGameTags, validateGameTags, resolveGameTag, tagResolutionSchema } from "./tag-service";
import { checkDuplicate, collectionContextSchema, consumeLimit, entryInput, entrySchema, layoutSchema, type Database, type Entry, type EntryInput } from "./model";
import { ConflictError } from "./postgres-store";

export const managementMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolve_tag"), revision: z.number().int(), resolution: tagResolutionSchema }),
  z.object({ action: z.literal("agent_tag_permission"), revision: z.number().int(), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("agent_site_permission"), revision: z.number().int(), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("collection_draft"), revision: z.number().int(), jobId: z.string().uuid(), sourceUrl: z.string().url(), entry: entryInput, tagSuggestions: tagSuggestionsSchema.optional() }),
  z.object({ action: z.literal("review"), revision: z.number().int(), id: entrySchema.shape.id, expectedUpdatedAt: z.iso.datetime(), decision: z.enum(["publish", "return", "reject"]), note: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("trash_entry"), revision: z.number().int(), id: entrySchema.shape.id, expectedUpdatedAt: z.iso.datetime() }),
  z.object({ action: z.literal("restore_entry"), revision: z.number().int(), id: entrySchema.shape.id, expectedUpdatedAt: z.iso.datetime() }),
  z.object({ action: z.literal("entry"), revision: z.number().int(), entry: entrySchema, tagSuggestions: tagSuggestionsSchema.optional() }),
  z.object({ action: z.literal("layout"), revision: z.number().int(), layout: layoutSchema, publish: z.boolean() }),
  z.object({ action: z.literal("import"), revision: z.number().int(), entries: z.array(entryInput).min(1).max(50) }),
  z.object({ action: z.literal("create_agent"), revision: z.number().int(), name: z.string().trim().min(2).max(60), canWriteDrafts: z.boolean(), canManageTags: z.boolean().optional(), canManageSite: z.boolean().optional() }),
  z.object({ action: z.literal("revoke_agent"), revision: z.number().int(), id: z.string().uuid() }),
  z.object({ action: z.literal("delete_agent"), revision: z.number().int(), id: z.string().uuid() }),
]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function log(db: Database, actor: string, action: string, title: string, entryId?: string) {
  // ponytail: recent activity only; move to an append-only table for long-term audit retention.
  db.activity.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, title, ...(entryId ? { entryId } : {}) });
  db.activity = db.activity.slice(0, 200);
}
function saveEntry(db: Database, input: Entry) {
  const old = db.entries.find(e => e.id === input.id);
  const item = { ...input,
    createdAt: old?.createdAt || new Date().toISOString(),
    updatedAt: new Date(Math.max(Date.now(), old ? Date.parse(old.updatedAt) + 1 : 0)).toISOString(),
  };
  // Publication is server-owned. Never accept client dates or substitute a draft's
  // creation / latest edit time for an unknown original publication time.
  const previouslyPublished = old && (old.status === "published" || old.restoreStatus === "published" ||
    db.reviews[old.id]?.decision === "publish" || db.activity.some(event => event.entryId === old.id &&
      (event.action === "entry.published" || event.action === "review.publish")));
  if (old?.publishedAt !== undefined) item.publishedAt = old.publishedAt;
  else if (previouslyPublished) item.publishedAt = null;
  else if (item.status === "published") item.publishedAt = item.updatedAt;
  else delete item.publishedAt;
  if (item.status === "archived") item.restoreStatus = old?.status === "archived" ? old.restoreStatus ?? "draft" : old?.status ?? "draft";
  else delete item.restoreStatus;
  // Older clients omit popularity; null explicitly clears an assessment.
  if (item.kind === "tool" && item.popularity === undefined && old?.popularity) item.popularity = old.popularity;
  if (item.kind !== "tool") delete item.popularity;
  validateGameTags(db, item, old);
  checkDuplicate(db.entries, item);
  db.entries = old ? db.entries.map(e => e.id === item.id ? item : e) : [item, ...db.entries];
  return item;
}
function newDraft(input: EntryInput, id = crypto.randomUUID()): Entry {
  return { ...input, id, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export function manageCatalog(db: Database, input: z.infer<typeof managementMutation>, actor = "ผู้ดูแล"): string | undefined {
  if (input.action === "resolve_tag") {
    resolveGameTag(db, input.resolution, "ผู้ดูแล");
  } else if (input.action === "agent_tag_permission") {
    const agent = db.agents.find(a => a.id === input.id && !a.revokedAt);
    if (!agent) throw new Error("ไม่พบเอเจนต์ที่ใช้งานได้");
    agent.canManageTags = input.enabled;
    log(db, "ผู้ดูแล", "agent.tag_permission", agent.name);
  } else if (input.action === "agent_site_permission") {
    const agent = db.agents.find(a => a.id === input.id && !a.revokedAt);
    if (!agent) throw new Error("ไม่พบเอเจนต์ที่ใช้งานได้");
    agent.canManageSite = input.enabled;
    log(db, "ผู้ดูแล", "agent.site_permission", agent.name);
  } else if (input.action === "collection_draft") {
    const job = db.collectionJobs.find(j => j.id === input.jobId);
    const candidate = job?.candidates.find(c => c.url === input.sourceUrl);
    if (!job || !candidate) throw new Error("ไม่พบโพสต์ต้นทางในงานนี้");
    const id = "collected-" + hash(candidate.url).slice(0, 40);
    if (db.entries.some(e => e.id === id || (e.sourceUrl === candidate.url && e.status !== "archived"))) throw new Error("โพสต์นี้มีฉบับร่างในคลังแล้ว กรุณาแก้รายการเดิม");
    const item = saveEntry(db, { ...newDraft(input.entry, id), sourceUrl: candidate.url, status: "pending" });
    requestGameTags(db, item, input.tagSuggestions || []);
    db.provenance[id] = { provider: "Apify", runId: job.runId, reason: `ผู้ดูแลคัดจาก ${job.source.name} และเขียนสรุปเพื่อส่งตรวจ` };
    log(db, "ผู้ดูแล", "entry.collection_draft", item.title, item.id);
  } else if (input.action === "entry") {
    const item = saveEntry(db, input.entry);
    requestGameTags(db, item, input.tagSuggestions || []);
    log(db, actor, `entry.${item.status}`, item.title, item.id);
  } else if (input.action === "trash_entry" || input.action === "restore_entry") {
    const old = db.entries.find(e => e.id === input.id);
    if (!old) throw new Error("ไม่พบรายการ");
    if (old.updatedAt !== input.expectedUpdatedAt) throw new ConflictError("รายการเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด");
    if (input.action === "trash_entry" && old.status === "archived") throw new Error("รายการอยู่ในถังขยะแล้ว");
    if (input.action === "restore_entry" && old.status !== "archived") throw new Error("กู้คืนได้เฉพาะรายการในถังขยะ");
    const item = saveEntry(db, { ...old, status: input.action === "trash_entry" ? "archived" : old.restoreStatus ?? "draft" });
    log(db, actor, input.action === "trash_entry" ? "entry.trashed" : "entry.restored", item.title, item.id);
  } else if (input.action === "layout") {
    if ([...input.layout.featuredIds, ...input.layout.spotlights.flatMap(g => g.entryIds)].some(id => !db.entries.some(e => e.id === id && e.kind === "game" && e.status === "published")))
      throw new Error("เลือกเกมแนะนำจากรายการที่เผยแพร่แล้วเท่านั้น");
    db.draftLayout = input.layout;
    if (input.publish) db.layout = structuredClone(input.layout);
    log(db, actor, input.publish ? "layout.published" : "layout.draft", "หน้าเว็บไซต์");
  } else if (input.action === "import") {
    for (const data of input.entries) {
      const item = saveEntry(db, newDraft(data));
      log(db, "ผู้ดูแล", "entry.import", item.title, item.id);
    }
  } else if (input.action === "create_agent") {
    if (db.agents.length >= 50) throw new Error("จำนวนคีย์ถึงขีดจำกัดแล้ว กรุณาติดต่อผู้ดูแลระบบ");
    const token = "gs_" + randomBytes(32).toString("base64url");
    db.agents.push({ id: crypto.randomUUID(), name: input.name, canWriteDrafts: input.canWriteDrafts, canManageTags: input.canManageTags ?? false, canManageSite: input.canManageSite ?? false,
      tokenHash: hash(token), createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), revokedAt: null });
    log(db, "ผู้ดูแล", "agent.created", input.name);
    return token;
  } else if (input.action === "review") {
    const old = db.entries.find(e => e.id === input.id);
    if (!old || old.status !== "pending") throw new Error("ตรวจได้เฉพาะรายการที่ส่งเข้าคิวรอตรวจแล้ว");
    if (old.updatedAt !== input.expectedUpdatedAt) throw new ConflictError("รายการเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนตรวจ");
    if (input.decision !== "publish" && !input.note.trim()) throw new Error("กรุณาใส่เหตุผลเพื่อให้ผู้ส่งทราบ");
    const status = { publish: "published", return: "draft", reject: "archived" } as const;
    const item = saveEntry(db, { ...old, status: status[input.decision] });
    db.reviews[item.id] = { decision: input.decision, note: input.note, at: item.updatedAt };
    log(db, actor, `review.${input.decision}`, item.title, item.id);
  } else if (input.action === "delete_agent") {
    const agent = db.agents.find(a => a.id === input.id);
    if (!agent) throw new Error("ไม่พบเอเจนต์");
    if (!agent.revokedAt && Date.parse(agent.expiresAt) > Date.now()) throw new Error("ต้องยกเลิกคีย์ก่อนลบถาวร");
    db.agents = db.agents.filter(a => a.id !== input.id);
    delete db.limits[`agent:${input.id}`];
    log(db, "ผู้ดูแล", "agent.deleted", agent.name);
  } else {
    const agent = db.agents.find(a => a.id === input.id);
    if (!agent) throw new Error("ไม่พบเอเจนต์");
    agent.revokedAt ??= new Date().toISOString();
    log(db, "ผู้ดูแล", "agent.revoked", agent.name);
  }
}
export function requireAgent(db: Database, id: string, write = false) {
  const agent = db.agents.find(a => a.id === id && !a.revokedAt && Date.parse(a.expiresAt) > Date.now());
  if (!agent || (write && !agent.canWriteDrafts && !agent.canManageSite)) throw new Error("เอเจนต์ไม่มีสิทธิ์ทำรายการนี้");
  return agent;
}
export function requireSiteAgent(db: Database, id: string) {
  const agent = requireAgent(db, id);
  if (!agent.canManageSite) throw new Error("เอเจนต์ไม่มีสิทธิ์จัดการเว็บ");
  return agent;
}
export function saveSiteEntry(db: Database, agentId: string, id: Entry["id"], expectedUpdatedAt: string | undefined, data: EntryInput, status: Entry["status"]) {
  const agent = requireSiteAgent(db, agentId);
  const old = db.entries.find(e => e.id === id);
  if (old && old.updatedAt !== expectedUpdatedAt) throw new ConflictError("รายการเปลี่ยนแล้ว กรุณาอ่านข้อมูลล่าสุดก่อนแก้ไข");
  if (!old && expectedUpdatedAt) throw new ConflictError("ไม่พบรายการที่จะแก้ไข");
  const now = new Date().toISOString();
  const entry = entrySchema.parse({ ...entryInput.parse(data), id, status, createdAt: old?.createdAt ?? now, updatedAt: now });
  manageCatalog(db, { action: "entry", revision: db.revision, entry }, agent.name);
  return db.entries.find(e => e.id === id)!;
}
export function authenticateAgent(db: Database, token: string, resource?: string) {
  if (!/^gs_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest = Buffer.from(hash(token));
  return db.agents.find(a => !a.revokedAt && Date.parse(a.expiresAt) > Date.now() &&
    !db.oauthGrants.some(grant => grant.agentId === a.id && (grant.accessExpiresAt <= Date.now() || (resource && grant.resource !== resource))) &&
    timingSafeEqual(Buffer.from(a.tokenHash), digest)) ?? null;
}
export function agentEntries(db: Database, agentId: string) {
  const agent = requireAgent(db, agentId);
  return agent.canManageSite ? db.entries : db.entries.filter(e => e.status === "published" || db.ingestions[e.id]?.agentId === agentId);
}
export function createAgentDraft(db: Database, agentId: string, requestId: string, data: EntryInput, context?: z.infer<typeof collectionContextSchema>) {
  const agent = requireAgent(db, agentId, true);
  const parsed = entryInput.parse(data);
  const id = "agent-" + hash(`${agentId}:${requestId}`).slice(0, 40);
  const collected = context ? collectionContextSchema.parse(context) : undefined;
  const inputHash = hash(JSON.stringify(collected ? { entry: parsed, context: collected } : parsed));
  const receipt = db.ingestions[id];
  if (receipt) {
    if (receipt.inputHash !== inputHash) throw new ConflictError("requestId นี้ถูกใช้กับข้อมูลอื่นแล้ว");
    const existing = db.entries.find(e => e.id === id);
    if (!existing) throw new Error("รายการนี้ถูกนำออกแล้ว กรุณาติดต่อผู้ดูแล");
    return existing;
  }
  consumeLimit(db, `agent:${agentId}`, 60, 3600000);
  const item = saveEntry(db, newDraft(parsed, id));
  db.ingestions[id] = { agentId, inputHash, ...(collected ? { context: collected } : {}) };
  log(db, agent.name, "entry.agent_draft", item.title, item.id);
  return item;
}
export function editAgentDraft(db: Database, agentId: string, id: string, expectedUpdatedAt: string, data?: EntryInput) {
  const agent = requireAgent(db, agentId, true);
  const old = db.entries.find(e => e.id === id);
  if (!old || db.ingestions[id]?.agentId !== agentId || old.status !== "draft")
    throw new Error("แก้ไขได้เฉพาะฉบับร่างที่เอเจนต์นี้สร้างเอง");
  if (old.updatedAt !== expectedUpdatedAt) throw new ConflictError("รายการเปลี่ยนแล้ว กรุณาอ่านข้อมูลล่าสุดก่อนแก้ไข");
  consumeLimit(db, `agent:${agentId}`, 60, 3600000);
  const item = saveEntry(db, data ? { ...old, ...entryInput.parse(data), status: "draft" } : { ...old, status: "pending" });
  log(db, agent.name, data ? "entry.agent_draft" : "entry.pending", item.title, item.id);
  return item;
}

