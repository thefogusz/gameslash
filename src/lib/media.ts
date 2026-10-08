import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { get, put } from "@vercel/blob";
import { mediaIdPattern } from "./article";
import { consumeLimit } from "./model";
import { requireAgent } from "./catalog-service";
import { updateDatabase } from "./store";
export const maxImageBytes = 2 * 1024 * 1024;
const directory = () => path.resolve(process.env.GAMESLASH_DATA_DIR || ".data", "media");
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxImageBytes) throw new Error("ภาพต้องมีขนาดไม่เกิน 2 MB");
  try {
    const input = sharp(bytes, { limitInputPixels: 25_000_000, animated:false });
    const meta = await input.metadata();
    if (!["jpeg","png","webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error();
    return await input.rotate().resize({ width:2000, height:2000, fit:"inside", withoutEnlargement:true }).webp({ quality:85 }).toBuffer({ resolveWithObject:true });
  } catch { throw new Error("ใช้ภาพ JPG, PNG หรือ WebP ที่เปิดอ่านได้ สูงสุด 25 ล้านพิกเซล"); }
}
export async function saveImage(bytes: Buffer, agentId?: string) {
  const { data, info } = await normalizeImage(bytes);
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("ยังไม่ได้เชื่อมที่เก็บภาพ");
  await updateDatabase(db => {
    if (agentId) requireAgent(db, agentId, true);
    consumeLimit(db, `media:${agentId || "admin"}`, 40, 60 * 60 * 1000);
    consumeLimit(db, "media:daily", 200, 24 * 60 * 60 * 1000);
  }, undefined, false); // Upload counters do not change the catalog being edited.
  const id = `${createHash("sha256").update(data).digest("hex")}.webp`;
  if (process.env.BLOB_READ_WRITE_TOKEN) await put(`media/${id}`, data, { access:"private", addRandomSuffix:false, allowOverwrite:true, contentType:"image/webp" });
  else { await mkdir(directory(), { recursive:true }); await writeFile(path.join(directory(), id), data); }
  return { url:`/api/media/${id}`, width:info.width, height:info.height, bytes:data.length, contentType:"image/webp" as const };
}
export async function readImage(id: string) {
  if (!mediaIdPattern.test(id)) return null;
  if (process.env.BLOB_READ_WRITE_TOKEN) return (await get(`media/${id}`, { access:"private" }))?.stream || null;
  if (process.env.VERCEL) return null;
  try { return new Uint8Array(await readFile(path.join(directory(), id))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
