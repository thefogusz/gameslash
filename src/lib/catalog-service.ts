import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { checkDuplicate, collectionContextSchema, consumeLimit, entryInput, entrySchema, layoutSchema, type Database, type Entry, type EntryInput } from "./model";
import { ConflictError } from "./postgres-store";

export const managementMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("review"), revision: z.number().int(), id: entrySchema.shape.id, expectedUpdatedAt: z.iso.datetime(), decision: z.enum(["publish", "return", "reject"]), note: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("entry"), revision: z.number().int(), entry: entrySchema }),
  z.object({ action: z.literal("layout"), revision: z.number().int(), layout: layoutSchema, publish: z.boolean() }),
  z.object({ action: z.literal("import"), revision: z.number().int(), entries: z.array(entryInput).min(1).max(50) }),
  z.object({ action: z.literal("create_agent"), revision: z.number().int(), name: z.string().trim().min(2).max(60), canWriteDrafts: z.boolean() }),
  z.object({ action: z.literal("revoke_agent"), revision: z.number().int(), id: z.string().uuid() }),
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
  checkDuplicate(db.entries, item);
  db.entries = old ? db.entries.map(e => e.id === item.id ? item : e) : [item, ...db.entries];
  return item;
}
function newDraft(input: EntryInput, id = crypto.randomUUID()): Entry {
  return { ...input, id, status: "draft", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export function manageCatalog(db: Database, input: z.infer<typeof managementMutation>): string | undefined {
  if (input.action === "entry") {
    const item = saveEntry(db, input.entry);
    log(db, "ผู้ดูแล", `entry.${item.status}`, item.title, item.id);
  } else if (input.action === "layout") {
    if (input.layout.featuredIds.some(id => !db.entries.some(e => e.id === id && e.kind === "game" && e.status === "published")))
      throw new Error("เลือกเกมแนะนำจากรายการที่เผยแพร่แล้วเท่านั้น");
    db.draftLayout = input.layout;
    if (input.publish) db.layout = structuredClone(input.layout);
    log(db, "ผู้ดูแล", input.publish ? "layout.published" : "layout.draft", "หน้าเว็บไซต์");
  } else if (input.action === "import") {
    for (const data of input.entries) {
      const item = saveEntry(db, newDraft(data));
      log(db, "ผู้ดูแล", "entry.import", item.title, item.id);
    }
  } else if (input.action === "create_agent") {
    if (db.agents.length >= 50) throw new Error("จำนวนคีย์ถึงขีดจำกัดแล้ว กรุณาติดต่อผู้ดูแลระบบ");
    const token = "gs_" + randomBytes(32).toString("base64url");
    db.agents.push({ id: crypto.randomUUID(), name: input.name, canWriteDrafts: input.canWriteDrafts,
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
    log(db, "ผู้ดูแล", `review.${input.decision}`, item.title, item.id);
  } else {
    const agent = db.agents.find(a => a.id === input.id);
    if (!agent) throw new Error("ไม่พบเอเจนต์");
    agent.revokedAt ??= new Date().toISOString();
    log(db, "ผู้ดูแล", "agent.revoked", agent.name);
  }
}
export function requireAgent(db: Database, id: string, write = false) {
  const agent = db.agents.find(a => a.id === id && !a.revokedAt && Date.parse(a.expiresAt) > Date.now());
  if (!agent || (write && !agent.canWriteDrafts)) throw new Error("เอเจนต์ไม่มีสิทธิ์ทำรายการนี้");
  return agent;
}
export function authenticateAgent(db: Database, token: string) {
  if (!/^gs_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest = Buffer.from(hash(token));
  return db.agents.find(a => !a.revokedAt && Date.parse(a.expiresAt) > Date.now() &&
    timingSafeEqual(Buffer.from(a.tokenHash), digest)) ?? null;
}
export function agentEntries(db: Database, agentId: string) {
  requireAgent(db, agentId);
  return db.entries.filter(e => e.status === "published" || db.ingestions[e.id]?.agentId === agentId);
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
