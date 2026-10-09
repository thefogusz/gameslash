import { z } from "zod";
import { databaseSchema, entrySchema, type Database } from "./model";
import { ConflictError } from "./postgres-store";

export function d1Ready() {
  return !!(process.env.GAMESLASH_D1_URL && process.env.GAMESLASH_D1_TOKEN);
}
async function requestD1(method: "GET" | "PUT", body?: unknown, path = "/catalog") {
  if (!d1Ready()) throw new Error("D1 URL and token are required");
  const response = await fetch(new URL(path, process.env.GAMESLASH_D1_URL), {
    method, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${process.env.GAMESLASH_D1_TOKEN}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 409) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
  if (!response.ok) throw new Error(`D1 catalog request failed (${response.status})`);
  return response.json();
}
const snapshotSchema = z.object({ version: z.number().int().nonnegative(), supportsGameLikes: z.boolean().default(false), db: databaseSchema });
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
    const { db, version, supportsGameLikes } = snapshotSchema.parse(await requestD1("GET"));
    const previousLikes = JSON.stringify(db.gameLikes);
    if (revision !== undefined && revision !== db.revision) throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    const previous = new Map(db.entries.map((data, position) => [data.id, { position, json: JSON.stringify(data) }]));
    change(db);
    if (!supportsGameLikes && (Object.keys(db.gameLikes).length || JSON.stringify(db.gameLikes) !== previousLikes))
      throw new Error("ระบบบันทึกหัวใจยังไม่พร้อม กรุณาอัปเดต D1 Worker ก่อน");
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
