import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { databaseSchema, type Database } from "./model";
import { seedDatabase } from "./seed";

const blobPath = "gameslash/catalog-v1.json";
const directory = path.resolve(
  /*turbopackIgnore: true*/ process.env.GAMESLASH_DATA_DIR || ".data",
);
const localPath = path.join(directory, "catalog.json");
const cloud = () =>
  !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
export class ConflictError extends Error {}
export function storageReady() {
  return cloud() || !process.env.VERCEL;
}
async function readSnapshot(): Promise<{ db: Database; etag?: string }> {
  if (cloud()) {
    const result = await get(blobPath, {
      access: "private",
      useCache: false,
      // Compression produces a weak ETag, which conditional writes cannot match.
      headers: { "accept-encoding": "identity" },
    });
    if (!result) return { db: seedDatabase() };
    if (!result.stream) throw new Error("ไม่สามารถอ่านคลังข้อมูลได้");
    return {
      db: databaseSchema.parse(await new Response(result.stream).json()),
      etag: result.blob.etag,
    };
  }
  if (process.env.VERCEL) return { db: seedDatabase() };
  try {
    return {
      db: databaseSchema.parse(JSON.parse(await readFile(localPath, "utf8"))),
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return { db: seedDatabase() };
    throw e;
  }
}
export async function readDatabase() {
  return (await readSnapshot()).db;
}

// ponytail: one conditional snapshot suits a small editorial catalog; move to Postgres for frequent concurrent writes or >3,000 entries.
export async function updateDatabase(
  change: (db: Database) => void,
  revision?: number,
): Promise<Database> {
  if (!storageReady())
    throw new Error("กรุณาเชื่อม Private Vercel Blob ก่อนบันทึกข้อมูล");
  if (cloud()) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { db, etag } = await readSnapshot();
      if (revision !== undefined && db.revision !== revision)
        throw new ConflictError(
          "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก",
        );
      change(db);
      db.revision++;
      try {
        await put(blobPath, JSON.stringify(databaseSchema.parse(db)), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: !!etag,
          ifMatch: etag,
          contentType: "application/json",
          cacheControlMaxAge: 60,
        });
        return db;
      } catch (e) {
        if (
          e instanceof BlobPreconditionFailedError ||
          (e instanceof Error && /already exists/i.test(e.message))
        )
          continue;
        throw e;
      }
    }
    throw new ConflictError("มีการบันทึกพร้อมกัน กรุณาลองอีกครั้ง");
  }
  await mkdir(directory, { recursive: true });
  let lock;
  try {
    lock = await open(path.join(directory, "write.lock"), "wx");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST")
      throw new ConflictError("กำลังบันทึกข้อมูล กรุณาลองอีกครั้ง");
    throw e;
  }
  try {
    const { db } = await readSnapshot();
    if (revision !== undefined && db.revision !== revision)
      throw new ConflictError(
        "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก",
      );
    change(db);
    db.revision++;
    const temp = localPath + ".tmp";
    await writeFile(
      temp,
      JSON.stringify(databaseSchema.parse(db), null, 2),
      "utf8",
    );
    await rename(temp, localPath);
    return db;
  } finally {
    await lock.close();
    await unlink(path.join(directory, "write.lock"));
  }
}
