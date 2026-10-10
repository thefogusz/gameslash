import { z } from "zod";
import { databaseSchema, entrySchema, type Database } from "./model";
import { ConflictError } from "./postgres-store";

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
async function requestD1(method: "GET" | "PUT", body?: unknown, path = "/catalog") {
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
    return await response.json();
  } catch (error) {
    if (error instanceof ConflictError || error instanceof D1RequestError) throw error;
    throw new D1RequestError(503, method === "PUT");
  }
}
const snapshotSchema = z.object({ version: z.number().int().nonnegative(), supportsGameLikes: z.boolean().default(false), supportsFeedback: z.boolean().default(false), supportsStablePositions: z.boolean().default(false), db: databaseSchema });
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
  const path = entryId === undefined ? "/catalog" : `/catalog?${new URLSearchParams({ entryId })}`;
  return (snapshotSchema.parse(await requestD1("GET", undefined, path))).db;
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
export async function updateD1(change: (db: Database) => void, revision?: number, bumpRevision = true) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await requestD1("GET");
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
    if (JSON.stringify(validated) === before) return validated;
    if (bumpRevision) validated.revision++;
    const { entries, ...state } = validated;
    const nextPositions = supportsStablePositions ? stablePositions(entries, previous) : entries.map((_, position) => position);
    const changed = entries.flatMap((data, i) => {
      const position = nextPositions[i];
      const old = previous.get(data.id); previous.delete(data.id);
      return old?.position === position && old.json === JSON.stringify(data) ? [] : [{ data, position }];
    });
    try {
      await requestD1("PUT", { expectedVersion: version, stablePositions: supportsStablePositions, state, changed, deleted: [...previous.keys()] });
      return validated;
    } catch (error) {
      if (!(error instanceof ConflictError) || revision !== undefined) throw error;
    }
  }
  throw new ConflictError("มีการบันทึกพร้อมกัน กรุณาลองอีกครั้ง");
}
