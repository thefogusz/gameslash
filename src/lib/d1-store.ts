import { z } from "zod";
import { databaseSchema, entrySchema, type Database } from "./model";
import { ConflictError } from "./postgres-store";
import { catalogChunkCharacters } from "./d1-protocol";
import { queueRecordSchema, type OperationContext } from "./write-queue";
import { editorialQaInput } from "./editorial-qa";

export function d1Ready() {
  return !!(process.env.GAMESLASH_D1_URL && process.env.GAMESLASH_D1_TOKEN);
}
export class D1RequestError extends Error {
  constructor(public status: number, public outcomeUnknown = false, public retryAfterSeconds = 5, public resetAt?: string) {
    super(`D1 catalog request failed (${status})`);
    this.name = "D1RequestError";
  }
}
const quotaSchema = z.object({ code: z.literal("D1_QUOTA_EXHAUSTED"), resetAt: z.iso.datetime() });
// shortcut: quota suppression is per server instance; use a shared gate if cold-instance retries become significant.
let quota: { url: string; reset: number } | undefined;
async function requestD1(method: "GET" | "PUT", body?: unknown, path = "/catalog", text = false) {
  if (!d1Ready()) throw new Error("D1 URL and token are required");
  if (quota && quota.url === process.env.GAMESLASH_D1_URL && quota.reset > Date.now())
    throw new D1RequestError(503, false, Math.ceil((quota.reset - Date.now()) / 1000), new Date(quota.reset).toISOString());
  try {
    const response = await fetch(new URL(path, process.env.GAMESLASH_D1_URL), {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(path === "/image-reservation" ? 5_000 : 30_000),
      headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 409) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    if (!response.ok) {
      const failure = response.status === 503 ? quotaSchema.safeParse(await response.json().catch(() => null)) : undefined;
      if (failure?.success) {
        const reset = Date.parse(failure.data.resetAt);
        if (reset > Date.now() && reset - Date.now() <= 86400000) {
          quota = { url: process.env.GAMESLASH_D1_URL!, reset };
          throw new D1RequestError(503, false, Math.ceil((reset - Date.now()) / 1000), failure.data.resetAt);
        }
      }
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) :
        retryAfter ? Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000) : 5;
      throw new D1RequestError(response.status, method === "PUT" && response.status >= 500,
        Number.isFinite(seconds) ? Math.max(5, seconds) : 5);
    }
    return text ? await response.text() : await response.json();
  } catch (error) {
    if (error instanceof ConflictError || error instanceof D1RequestError) throw error;
    throw new D1RequestError(503, method === "PUT");
  }
}
const snapshotSchema = z.object({ version: z.number().int().nonnegative(), supportsGameLikes: z.boolean().default(false), supportsFeedback: z.boolean().default(false), supportsStablePositions: z.boolean().default(false), db: databaseSchema });
const chunkManifestSchema = snapshotSchema.omit({ db: true }).extend({
  stateCharacters: z.number().int().min(2).max(1_800_000),
  entryCharacters: z.number().int().min(2).max(1_800_000).nullable(),
  chunkSize: z.number().int().positive().max(catalogChunkCharacters),
});
async function readSnapshotD1(entryId?: string, summary = false) {
  const query = new URLSearchParams({ format: "chunks", ...(entryId === undefined ? {} : { entryId }), ...(summary ? { summary: "1" } : {}) });
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await requestD1("GET", undefined, `/catalog?${query}`);
    // Older Workers ignore format and return the existing validated snapshot protocol.
    if (!Object.hasOwn(response, "stateCharacters")) return response;
    const manifest = chunkManifestSchema.parse(response);
    if (manifest.entryCharacters === null) {
      if (summary) throw new Error("Metadata exceeds bounded read limit");
      try {
        const pages = z.array(z.object({ page: z.number().int().nonnegative(), characters: z.number().int().min(2).max(1_800_000) })).max(3000)
          .parse(await requestD1("GET", undefined, `/catalog-pages?version=${manifest.version}`));
        const requests: { path: string; group: number }[] = [];
        for (let offset = 0; offset < manifest.stateCharacters; offset += manifest.chunkSize)
          requests.push({ path: `/catalog-chunk?version=${manifest.version}&part=state&offset=${offset}`, group: -1 });
        for (const { page, characters } of pages) for (let offset = 0; offset < characters; offset += manifest.chunkSize)
          requests.push({ path: `/catalog-page?version=${manifest.version}&page=${page}&offset=${offset}`, group: page });
        const groups = new Map<number, string[]>();
        for (let i = 0; i < requests.length; i += 4) {
          const batch = requests.slice(i, i + 4);
          const chunks = await Promise.all(batch.map(item => requestD1("GET", undefined, item.path, true) as Promise<string>));
          batch.forEach((item, index) => { const group = groups.get(item.group) ?? []; group.push(chunks[index]); groups.set(item.group, group); });
        }
        const entries = pages.flatMap(({ page }) => JSON.parse(groups.get(page)!.join("")));
        return { ...manifest, db: { ...JSON.parse(groups.get(-1)!.join("")), entries } };
      } catch (error) { if (!(error instanceof ConflictError)) throw error; continue; }
    }
    const requests: { part: string; offset: number }[] = [];
    for (const [part, length] of [["state", manifest.stateCharacters], ["entries", manifest.entryCharacters]] as const)
      for (let offset = 0; offset < length; offset += manifest.chunkSize) requests.push({ part, offset });
    const chunks: string[] = [];
    try {
      for (let i = 0; i < requests.length; i += 4) chunks.push(...await Promise.all(requests.slice(i, i + 4).map(({ part, offset }) => {
        const params = new URLSearchParams({ version: String(manifest.version), part, offset: String(offset), ...(entryId === undefined ? {} : { entryId }), ...(summary ? { summary: "1" } : {}) });
        return requestD1("GET", undefined, `/catalog-chunk?${params}`, true) as Promise<string>;
      })));
      const stateChunks = Math.ceil(manifest.stateCharacters / manifest.chunkSize);
      return { ...manifest, db: { ...JSON.parse(chunks.slice(0, stateChunks).join("")), entries: JSON.parse(chunks.slice(stateChunks).join("")) } };
    } catch (error) { if (!(error instanceof ConflictError)) throw error; }
  }
  throw new ConflictError("ข้อมูลเปลี่ยนระหว่างอ่าน กรุณาลองใหม่");
}
const storedPositionsSchema = z.array(z.object({ id: entrySchema.shape.id, _d1Position: z.number().int().optional() })).max(3000);
function stablePositions(entries: Database["entries"], previous: Map<string, { position: number }>) {
  const positions = entries.map(entry => previous.get(entry.id)?.position);
  const first = positions.findIndex(position => position !== undefined);
  const last = positions.findLastIndex(position => position !== undefined);
  // Prepending/deleting keeps existing ranks; explicit reorders and middle inserts rebalance.
  if (first === -1 || positions.slice(first, last + 1).some((position, i) =>
    position === undefined || (i > 0 && position <= positions[first + i - 1]!)))
    return entries.map((_, position) => position);
  const ranked = positions.map((position, i) => position ?? (i < first
    ? positions[first]! - first + i : positions[last]! + i - last));
  return ranked.every(Number.isSafeInteger) ? ranked : entries.map((_, position) => position);
}
export async function readD1Notifications() {
  const { id, title, kind, status, updatedAt } = entrySchema.shape;
  return z.object({ total: z.number().int().nonnegative(), items: z.array(z.object({
    id, title, kind, status, updatedAt,
  })).max(50) }).parse(await requestD1("GET", undefined, "/notifications"));
}
export async function readD1(entryId?: string) {
  return snapshotSchema.parse(await readSnapshotD1(entryId)).db;
}
export async function readD1Metadata() {
  return snapshotSchema.parse(await readSnapshotD1("mcp-metadata", true)).db;
}
export async function readD1QaEvidence(id: string) {
  return editorialQaInput.nullable().parse(await requestD1("GET", undefined, `/editorial-qa?${new URLSearchParams({ entryId: id })}`));
}
export async function readD1Tags() {
  return databaseSchema.shape.customTags.parse(await requestD1("GET", undefined, "/tags"));
}
export async function readD1AgentAuth() {
  return databaseSchema.pick({ agents: true, oauthGrants: true }).parse(await requestD1("GET", undefined, "/agent-auth"));
}
export async function readD1Likes(visitor: string) {
  return z.array(entrySchema.shape.id).max(3000).parse(await requestD1("GET", undefined, `/likes?${new URLSearchParams({ visitor })}`));
}
export async function reserveD1Image(imageId: string, agentId?: string, namespace: "media" | "feedback" = "media") {
  for (let attempt = 0; ; attempt++) {
    try {
      z.object({ reserved: z.literal(true) }).parse(await requestD1("PUT", { imageId, agentId, namespace }, "/image-reservation"));
      return;
    } catch (error) {
      const transient = error instanceof ConflictError || (error instanceof D1RequestError && error.status >= 500 && !error.resetAt);
      // Only this receipt-backed operation is safe to repeat after a lost response.
      if (transient && attempt < 2) { await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))); continue; }
      if (error instanceof D1RequestError && error.outcomeUnknown)
        throw new D1RequestError(error.status, false, error.retryAfterSeconds, error.resetAt);
      throw error;
    }
  }
}
export async function initializeD1(input: Database) {
  const db = databaseSchema.parse(input);
  if (new Set(db.entries.map(entry => entry.id)).size !== db.entries.length) throw new Error("Duplicate entry IDs");
  const { entries, ...state } = db;
  await requestD1("PUT", { expectedVersion: 0, initialize: true, state,
    changed: entries.map((data, position) => ({ data, position })), deleted: [] });
}
export async function readD1Operation(agentId: string, tool: string, requestId: string) {
  const response = await requestD1("GET", undefined, `/write-queue?${new URLSearchParams({ agentId, tool, requestId })}`);
  return z.object({ operation: queueRecordSchema.nullable() }).parse(response).operation;
}
export async function updateD1Queued(change: (db: Database) => void, revision?: number, scopeId?: string, operation?: OperationContext) {
  const ticket = crypto.randomUUID();
  const enqueue = queueRecordSchema.parse(await requestD1("PUT", { ticket, action: "enqueue", operation }, "/write-queue"));
  if (enqueue.ticket !== ticket) {
    if (enqueue.status === "succeeded" && scopeId) return readD1(scopeId);
    if (enqueue.status === "unknown") throw new D1RequestError(503, true);
    if (enqueue.status === "failed") throw new ConflictError("รหัสงานนี้ล้มเหลวแล้ว กรุณาตรวจสาเหตุและใช้รหัสงานใหม่เมื่อแก้ไขแล้ว");
    throw new D1RequestError(429, false);
  }
  let acquired = false;
  const deadline = Date.now() + 8_000;
  try {
    while (Date.now() < deadline) {
      const row = queueRecordSchema.parse(await requestD1("PUT", { ticket, action: "claim" }, "/write-queue"));
      if (row.status === "running") { acquired = true; break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    if (!acquired) throw new D1RequestError(429, false);
    return await updateD1(change, revision, true, { ticket, scopeId });
  } catch (error) {
    // A lost catalog reply may already have committed; never turn its receipt into a failed operation.
    await requestD1("PUT", { ticket, action: acquired ? "complete" : "cancel", outcome: error instanceof D1RequestError && error.outcomeUnknown ? "unknown" : "failed",
      result: JSON.stringify({ error: error instanceof ConflictError ? "CONFLICT" : error instanceof D1RequestError ? "STORAGE_UNAVAILABLE" : "REQUEST_FAILED",
        ...(error instanceof Error && /[ก-๙]/.test(error.message) ? { message: error.message.slice(0, 500) } : {}) }) }, "/write-queue").catch(() => undefined);
    throw error;
  }
}
export async function updateD1(change: (db: Database) => void, revision?: number, bumpRevision = true, queue?: { ticket: string; scopeId?: string }) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await readSnapshotD1(queue?.scopeId, queue?.scopeId !== undefined);
    const { db, version, supportsGameLikes, supportsFeedback, supportsStablePositions } = snapshotSchema.parse(response);
    const positions = supportsStablePositions
      ? new Map(storedPositionsSchema.parse(response.db.entries).map((entry, i) => [entry.id, entry._d1Position ?? i]))
      : new Map(db.entries.map((entry, i) => [entry.id, i]));
    const before = JSON.stringify(db);
    const previousLikes = JSON.stringify(db.gameLikes);
    const previousFeedback = JSON.stringify(db.feedback);
    if (revision !== undefined && revision !== db.revision) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    const previous = new Map(db.entries.map(data => [data.id, { position: positions.get(data.id)!, json: JSON.stringify(data) }]));
    change(db);
    if (!supportsGameLikes && (Object.keys(db.gameLikes).length || JSON.stringify(db.gameLikes) !== previousLikes))
      throw new Error("ระบบบันทึกหัวใจยังไม่พร้อม กรุณาอัปเดต D1 Worker ก่อน");
    if (!supportsFeedback && (db.feedback.length || JSON.stringify(db.feedback) !== previousFeedback))
      throw new Error("ระบบรับฟีดแบคยังไม่พร้อม กรุณาอัปเดต D1 Worker ก่อน");
    const validated = databaseSchema.parse(db);
    if (new Set(validated.entries.map(entry => entry.id)).size !== validated.entries.length) throw new Error("Duplicate entry IDs");
    if (queue?.scopeId !== undefined && validated.entries.some(entry => entry.id !== queue.scopeId && previous.get(entry.id)?.json !== JSON.stringify(entry)))
      throw new Error("Scoped update cannot change another entry");
    if (queue?.scopeId !== undefined && [...previous.keys()].some(id => id !== queue.scopeId && !validated.entries.some(entry => entry.id === id)))
      throw new Error("Scoped update cannot delete another entry");
    if (queue?.scopeId !== undefined && JSON.stringify(validated.entries.filter(e => e.id !== queue.scopeId).map(e => e.id)) !== JSON.stringify([...previous.keys()].filter(id => id !== queue.scopeId)))
      throw new Error("Scoped update cannot reorder another entry");
    const unchanged = JSON.stringify(validated) === before;
    const scopedEntry = validated.entries.find(e => e.id === queue?.scopeId);
    const operationResult = JSON.stringify({ revision: validated.revision + Number(bumpRevision && !unchanged), ...(scopedEntry ? { entryId: scopedEntry.id, updatedAt: scopedEntry.updatedAt } : {}) });
    if (unchanged) {
      if (queue) await requestD1("PUT", { ticket: queue.ticket, action: "complete", outcome: "succeeded", result: operationResult }, "/write-queue");
      return validated;
    }
    if (bumpRevision) validated.revision++;
    const { entries, ...state } = validated;
    const nextPositions = supportsStablePositions ? stablePositions(entries, previous) : entries.map((_, position) => position);
    const changed = entries.flatMap((data, i) => {
      const position = nextPositions[i];
      const old = previous.get(data.id); previous.delete(data.id);
      return old?.position === position && old.json === JSON.stringify(data) ? [] : [{ data, position }];
    });
    if (queue?.scopeId !== undefined && changed.some(row => row.data.id !== queue.scopeId)) throw new Error("Scoped update cannot change another entry position");
    try {
      await requestD1("PUT", { expectedVersion: version, stablePositions: supportsStablePositions, state, changed, deleted: [...previous.keys()], ...(queue ? { ticket: queue.ticket, operationResult } : {}) });
      return validated;
    } catch (error) {
      if (!(error instanceof ConflictError) || revision !== undefined) throw error;
    }
  }
  throw new ConflictError("มีการบันทึกพร้อมกัน กรุณาลองอีกครั้ง");
}
