import { z } from "zod";
import { databaseSchema, entrySchema, type Database } from "./model";
import { ConflictError } from "./postgres-store";

export function d1Ready() {
  return !!(process.env.GAMESLASH_D1_URL && process.env.GAMESLASH_D1_TOKEN);
}
export class D1RequestError extends Error {
  constructor(public status: number, public outcomeUnknown = false, public retryAfterSeconds = 5) {
    super(`D1 catalog request failed (${status})`);
    this.name = "D1RequestError";
  }
}
async function requestD1(method: "GET" | "PUT", body?: unknown, path = "/catalog") {
  if (!d1Ready()) throw new Error("D1 URL and token are required");
  try {
    const response = await fetch(new URL(path, process.env.GAMESLASH_D1_URL), {
      method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 409) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    if (!response.ok) {
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
const snapshotSchema = z.object({ version: z.number().int().nonnegative(), supportsGameLikes: z.boolean().default(false), supportsFeedback: z.boolean().default(false), db: databaseSchema });
export async function readD1Notifications() {
  const { id, title, kind, status, updatedAt } = entrySchema.shape;
  return z.object({ total: z.number().int().nonnegative(), items: z.array(z.object({
    id, title, kind, status, updatedAt,
  })).max(50) }).parse(await requestD1("GET", undefined, "/notifications"));
}
export async function readD1() {
  return (snapshotSchema.parse(await requestD1("GET"))).db;
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
    const { db, version, supportsGameLikes, supportsFeedback } = snapshotSchema.parse(await requestD1("GET"));
    const previousLikes = JSON.stringify(db.gameLikes);
    const previousFeedback = JSON.stringify(db.feedback);
    if (revision !== undefined && revision !== db.revision) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    const previous = new Map(db.entries.map((data, position) => [data.id, { position, json: JSON.stringify(data) }]));
    change(db);
    if (!supportsGameLikes && (Object.keys(db.gameLikes).length || JSON.stringify(db.gameLikes) !== previousLikes))
      throw new Error("ระบบบันทึกหัวใจยังไม่พร้อม กรุณาอัปเดต D1 Worker ก่อน");
    if (!supportsFeedback && (db.feedback.length || JSON.stringify(db.feedback) !== previousFeedback))
      throw new Error("ระบบรับฟีดแบคยังไม่พร้อม กรุณาอัปเดต D1 Worker ก่อน");
    if (bumpRevision) db.revision++;
    const validated = databaseSchema.parse(db);
    if (new Set(validated.entries.map(entry => entry.id)).size !== validated.entries.length) throw new Error("Duplicate entry IDs");
    const { entries, ...state } = validated;
    const changed = entries.flatMap((data, position) => {
      const old = previous.get(data.id); previous.delete(data.id);
      return old?.position === position && old.json === JSON.stringify(data) ? [] : [{ data, position }];
    });
    try {
      await requestD1("PUT", { expectedVersion: version, state, changed, deleted: [...previous.keys()] });
      return validated;
    } catch (error) {
      if (!(error instanceof ConflictError) || revision !== undefined) throw error;
    }
  }
  throw new ConflictError("มีการบันทึกพร้อมกัน กรุณาลองอีกครั้ง");
}
