import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { get, put } from "@vercel/blob";
import { mediaIdPattern } from "./article";
import { consumeLimit } from "./model";
import { requireAgent } from "./catalog-service";
import { storageReady, updateDatabase } from "./store";
import { reserveD1Image } from "./d1-store";
import { ImageUploadError } from "./media-errors";
export const maxImageBytes = 2 * 1024 * 1024;
const directory = (namespace = "media") => path.resolve(process.env.GAMESLASH_DATA_DIR || ".data", namespace);
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxImageBytes) throw new Error("ภาพต้องมีขนาดไม่เกิน 2 MB");
  try {
    const input = sharp(bytes, { limitInputPixels: 25_000_000, animated:false });
    const meta = await input.metadata();
    if (!["jpeg","png","webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error();
    return await input.rotate().keepIccProfile().webp({ lossless:true }).toBuffer({ resolveWithObject:true });
  } catch { throw new Error("ใช้ภาพ JPG, PNG หรือ WebP ที่เปิดอ่านได้ สูงสุด 25 ล้านพิกเซล"); }
}
export async function saveImage(bytes: Buffer, agentId?: string, namespace: "media" | "feedback" = "media") {
  const { data, info } = await normalizeImage(bytes);
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("ยังไม่ได้เชื่อมที่เก็บภาพ");
  if (!storageReady()) throw new Error("ระบบบันทึกข้อมูลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง");
  const hash = createHash("sha256").update(data).digest("hex");
  if (process.env.GAMESLASH_STORAGE === "d1") await reserveD1Image(hash, agentId, namespace);
  else await updateDatabase(db => {
    if (agentId) requireAgent(db, agentId, true);
    consumeLimit(db, `${namespace}:${agentId || "admin"}`, 40, 60 * 60 * 1000);
    consumeLimit(db, `${namespace}:daily`, 200, 24 * 60 * 60 * 1000);
  }, undefined, false); // Upload counters do not change the catalog being edited.
  const id = `${hash}.webp`;
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) await put(`${namespace}/${id}`, data, { access:"private", addRandomSuffix:false, allowOverwrite:true, contentType:"image/webp" });
    else { await mkdir(directory(namespace), { recursive:true }); await writeFile(path.join(directory(namespace), id), data); }
  } catch (error) { throw new ImageUploadError(error); }
  return { url: namespace === "feedback" ? `/api/feedback/image/${id}` : `/api/media/${id}`, width:info.width, height:info.height, bytes:data.length, contentType:"image/webp" as const };
}
export async function readImage(id: string, namespace: "media" | "feedback" = "media") {
  if (!mediaIdPattern.test(id)) return null;
  if (process.env.BLOB_READ_WRITE_TOKEN) return (await get(`${namespace}/${id}`, { access:"private" }))?.stream || null;
  if (process.env.VERCEL) return null;
  try { return new Uint8Array(await readFile(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ directory(namespace), id))); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
