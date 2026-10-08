import postgres, { type Sql, type TransactionSql } from "postgres";
import { databaseSchema, type Database } from "./model";

export class ConflictError extends Error {}

let client: Sql | undefined;
export function databaseClient() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (client ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}

export async function createTables(sql: Sql) {
  await sql.begin(async (tx) => {
    await tx`CREATE TABLE IF NOT EXISTS gameslash_state (
      id integer PRIMARY KEY CHECK (id = 1),
      data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object')
    )`;
    await tx`CREATE TABLE IF NOT EXISTS gameslash_entries (
      id text PRIMARY KEY,
      position integer NOT NULL,
      data jsonb NOT NULL CHECK (data->>'id' = id)
    )`;
  });
}

// One statement gives readers a consistent snapshot across both tables.
export async function readPostgres(sql: Sql | TransactionSql): Promise<Database> {
  const [row] = await sql`SELECT data || jsonb_build_object('entries',
    COALESCE((SELECT jsonb_agg(data ORDER BY position, id)
      FROM gameslash_entries), '[]'::jsonb)) AS catalog
    FROM gameslash_state WHERE id = 1`;
  if (!row) throw new Error("Postgres catalog has not been migrated");
  return databaseSchema.parse(row.catalog);
}

export async function initializePostgres(sql: Sql, input: Database) {
  const db = databaseSchema.parse(input);
  if (new Set(db.entries.map((entry) => entry.id)).size !== db.entries.length)
    throw new Error("Duplicate entry IDs in migration source");
  return sql.begin(async (tx) => {
    // Migration only seeds an empty target; never overwrite a live catalog.
    await tx`LOCK TABLE gameslash_state, gameslash_entries IN EXCLUSIVE MODE`;
    const [existing] = await tx`SELECT
      (SELECT count(*) FROM gameslash_state) +
      (SELECT count(*) FROM gameslash_entries) AS count`;
    if (Number(existing.count) !== 0)
      throw new Error("Postgres target is not empty; migration refused");
    const { entries, ...state } = db;
    await tx`INSERT INTO gameslash_state (id, data) VALUES (1, ${tx.json(state)})`;
    if (entries.length) {
      const rows = entries.map((data, position) => ({ id: data.id, position, data }));
      await tx`INSERT INTO gameslash_entries ${tx(rows, "id", "position", "data")}`;
    }
  });
}

export async function updatePostgres(
  sql: Sql,
  change: (db: Database) => void,
  revision?: number,
): Promise<Database> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL statement_timeout = '15s'`;
    // ponytail: serialize writes to preserve the current catalog revision API;
    // move to per-entry revisions when independent concurrent editing is needed.
    await tx`SELECT id FROM gameslash_state WHERE id = 1 FOR UPDATE`;
    const db = await readPostgres(tx);
    if (revision !== undefined && db.revision !== revision)
      throw new ConflictError("ข้อมูลเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก");
    const previous = new Map(db.entries.map((entry, position) => [
      entry.id, { position, json: JSON.stringify(entry) },
    ]));
    change(db);
    db.revision++;
    const validated = databaseSchema.parse(db);
    if (new Set(validated.entries.map((entry) => entry.id)).size !== validated.entries.length)
      throw new Error("Duplicate entry IDs");
    const { entries, ...state } = validated;
    const changed = entries.flatMap((data, position) => {
      const old = previous.get(data.id);
      previous.delete(data.id);
      return old?.position === position && old.json === JSON.stringify(data)
        ? [] : [{ id: data.id, position, data }];
    });
    if (changed.length)
      await tx`INSERT INTO gameslash_entries ${tx(changed, "id", "position", "data")}
        ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, data = EXCLUDED.data`;
    if (previous.size)
      await tx`DELETE FROM gameslash_entries WHERE id IN ${tx([...previous.keys()])}`;
    await tx`UPDATE gameslash_state SET data = ${tx.json(state)} WHERE id = 1`;
    return validated;
  });
}
