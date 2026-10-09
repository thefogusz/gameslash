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
import { databaseClient, readPostgres, updatePostgres, ConflictError } from "./postgres-store";
import { d1Ready, readD1, readD1AgentAuth, readD1Likes, readD1Notifications, updateD1 } from "./d1-store";
import { draftNotifications } from "./notifications";
export { ConflictError } from "./postgres-store";

const blobPath = "gameslash/catalog-v1.json";
const directory = path.resolve(
  /*turbopackIgnore: true*/ process.env.GAMESLASH_DATA_DIR || ".data",
);
const localPath = path.join(directory, "catalog.json");
const cloud = () =>
  !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const usesPostgres = () => process.env.GAMESLASH_STORAGE === "postgres";
export function storageReady() {
  if (process.env.GAMESLASH_READ_ONLY === "true") return false;
  if (process.env.GAMESLASH_STORAGE === "d1") return d1Ready();
  return usesPostgres() ? !!process.env.DATABASE_URL : cloud() || !process.env.VERCEL;
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
  if (process.env.GAMESLASH_STORAGE === "d1") return readD1();
  if (usesPostgres()) return readPostgres(databaseClient());
  return (await readSnapshot()).db;
}
export async function readAgentAuth() {
  if (process.env.GAMESLASH_STORAGE === "d1") return readD1AgentAuth();
  const { agents, oauthGrants } = await readDatabase();
  return { agents, oauthGrants };
}
export async function readEntryDatabase(id: string) {
  return process.env.GAMESLASH_STORAGE === "d1" ? readD1(id) : readDatabase();
}
export async function readGameLikes(visitor: string) {
  return process.env.GAMESLASH_STORAGE === "d1" ? readD1Likes(visitor) : (await readDatabase()).gameLikes[visitor] || [];
}
export async function readNotifications() {
  return process.env.GAMESLASH_STORAGE === "d1"
    ? readD1Notifications() : draftNotifications((await readDatabase()).entries);
}

// ponytail: one conditional snapshot suits a small editorial catalog; move to Postgres for frequent concurrent writes or >3,000 entries.
export async function updateDatabase(
  change: (db: Database) => void,
  revision?: number,
  bumpRevision = true,
): Promise<Database> {
  if (!storageReady())
    throw new Error("ระบบบันทึกข้อมูลยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง");
  if (process.env.GAMESLASH_STORAGE === "d1") return updateD1(change, revision, bumpRevision);
  if (usesPostgres()) return updatePostgres(databaseClient(), change, revision, bumpRevision);
  if (cloud()) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { db, etag } = await readSnapshot();
      if (revision !== undefined && db.revision !== revision)
        throw new ConflictError(
          "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก",
        );
      change(db);
      if (bumpRevision) db.revision++;
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
    if (bumpRevision) db.revision++;
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
