import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { consumeLimit, databaseSchema, entrySchema, type Database } from "../src/lib/model";
import { catalogChunkCharacters } from "../src/lib/d1-protocol";
import { writeQueue } from "./write-queue";

const mutationSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  initialize: z.boolean().default(false),
  stablePositions: z.boolean().default(false),
  state: databaseSchema.omit({ entries: true }),
  changed: z.array(z.object({ position: z.number().int(), data: entrySchema })).max(3000),
  deleted: z.array(entrySchema.shape.id).max(3000),
  ticket: z.uuid().optional(),
  operationResult: z.string().max(2000).optional(),
}).refine(input => new Set(input.changed.map(row => row.data.id)).size === input.changed.length);
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store" },
});
// Unchanged entries supply only duplicate/layout metadata; their stored content is never written back.
const summaryExpression = `(SELECT json_group_array(json(entry)) FROM (SELECT CASE WHEN id = ?
  THEN json_set(data, '$._d1Position', position) ELSE json_object('id', id, '_d1Position', position,
  'kind', json_extract(data, '$.kind'), 'status', json_extract(data, '$.status'),
  'title', json_extract(data, '$.title'), 'author', json_extract(data, '$.author'),
  'category', json_extract(data, '$.category'), 'url', json_extract(data, '$.url'),
  'description', json_extract(data, '$.description'), 'tags', json(COALESCE(json_extract(data, '$.tags'), '[]')), 'createdAt', json_extract(data, '$.createdAt'),
  'updatedAt', json_extract(data, '$.updatedAt')) END AS entry FROM gameslash_entries ORDER BY position, id))`;
// Byte-weighted groups keep large catalogs out of one D1 result value.
const catalogPagesSql = `WITH ranked AS (SELECT data, position,
  sum(length(CAST(data AS BLOB)) + 64) OVER (ORDER BY position, id) AS bytes FROM gameslash_entries),
  pages AS (SELECT CAST(bytes / 32768 AS INTEGER) AS page,
  json_group_array(json(json_set(data, '$._d1Position', position))) AS entries FROM ranked GROUP BY page)`;
const imageReservationSchema = z.object({
  namespace: z.enum(["media", "feedback"]),
  imageId: z.string().regex(/^[a-f0-9]{64}$/),
  agentId: z.uuid().optional(),
});
async function reserveImage(input: z.infer<typeof imageReservationSchema>, env: Env) {
  const actor = `${input.namespace}:${input.agentId || "admin"}`;
  const daily = `${input.namespace}:daily`;
  const key = `${actor}:${input.imageId}`;
  const actorPath = `$.limits."${actor}"`, dailyPath = `$.limits."${daily}"`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    // Project only two counters and current permissions, never the catalog or private jobs.
    const row = await env.DB.prepare(`SELECT version,
      COALESCE(json_extract(data, ?), '{}') AS actor,
      COALESCE(json_extract(data, ?), '{}') AS daily,
      (? IS NULL OR EXISTS (SELECT 1 FROM json_each(data, '$.agents')
        WHERE json_extract(value, '$.id') = ? AND json_extract(value, '$.revokedAt') IS NULL
        AND julianday(json_extract(value, '$.expiresAt')) > julianday(?)
        AND (json_extract(value, '$.canWriteDrafts') = 1 OR json_extract(value, '$.canManageSite') = 1))) AS allowed,
      EXISTS (SELECT 1 FROM gameslash_image_reservations WHERE key = ? AND expires > ?) AS reserved
      FROM gameslash_state WHERE id = 1 AND data != '{}'`)
      .bind(actorPath, dailyPath, input.agentId ?? null, input.agentId ?? null, new Date(now).toISOString(), key, now)
      .first<{ version: number; actor: string; daily: string; allowed: number; reserved: number }>();
    if (!row) return json({ error: "D1 catalog has not been migrated" }, 503);
    if (!row.allowed) return json({ error: "Agent cannot upload images" }, 403);
    if (row.reserved) return json({ reserved: true });
    const limits: Database["limits"] = {};
    for (const [name, value] of [[actor, row.actor], [daily, row.daily]]) {
      const counter = JSON.parse(value);
      if (counter.reset > now) limits[name] = counter;
    }
    const db = { limits: databaseSchema.shape.limits.parse(limits) };
    const exhausted = [actor, daily].filter(name => (db.limits[name]?.count ?? 0) >= (name === actor ? 40 : 200));
    if (exhausted.length) {
      const response = json({ error: "Image upload limit reached" }, 429);
      response.headers.set("Retry-After", String(Math.max(5, Math.ceil((Math.max(...exhausted.map(name => db.limits[name].reset)) - now) / 1000))));
      return response;
    }
    consumeLimit(db, actor, 40, 60 * 60 * 1000, now);
    consumeLimit(db, daily, 200, 24 * 60 * 60 * 1000, now);
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT OR REPLACE INTO gameslash_write_guard (id, valid)
          VALUES (1, (SELECT count(*) FROM gameslash_state WHERE id = 1 AND version = ?))`).bind(row.version),
        env.DB.prepare("DELETE FROM gameslash_image_reservations WHERE expires <= ?").bind(now),
        env.DB.prepare("INSERT OR REPLACE INTO gameslash_image_reservations (key, expires) VALUES (?, ?)").bind(key, now + 86400000),
        env.DB.prepare(`UPDATE gameslash_state SET version = version + 1,
          data = json_set(data, ?, json(?), ?, json(?)) WHERE id = 1`)
          .bind(actorPath, JSON.stringify(db.limits[actor]), dailyPath, JSON.stringify(db.limits[daily])),
        env.DB.prepare("UPDATE gameslash_entry_snapshot SET version = ? WHERE id = 1 AND version = ?").bind(row.version + 1, row.version),
      ]);
      return json({ reserved: true });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("CHECK constraint failed: valid = 1"))) throw error;
    }
  }
  return json({ error: "Catalog changed; retry the same image" }, 409);
}

export default {
  async fetch(request, env) {
    const supplied = new TextEncoder().encode(request.headers.get("Authorization") || "");
    const expected = new TextEncoder().encode(`Bearer ${env.D1_SERVICE_TOKEN}`);
    if (!env.D1_SERVICE_TOKEN || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    const path = url.pathname;
    if (!["/catalog", "/catalog-chunk", "/catalog-pages", "/catalog-page", "/notifications", "/agent-auth", "/likes", "/image-reservation", "/tags", "/write-queue", "/editorial-qa"].includes(path)) return json({ error: "Not found" }, 404);
    try {
      if (path === "/write-queue") return await writeQueue(request, env);
      if (path === "/editorial-qa") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const entryId = url.searchParams.get("entryId");
        if (!entrySchema.shape.id.safeParse(entryId).success) return json({ error: "Invalid entry ID" }, 400);
        const data = await env.DB.prepare("SELECT data FROM gameslash_editorial_qa WHERE entry_id = ?").bind(entryId).first<string>("data");
        return new Response(data ?? "null", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
      if (path === "/catalog-pages" || path === "/catalog-page") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const version = url.searchParams.get("version"), page = url.searchParams.get("page"), offset = url.searchParams.get("offset");
        if (!version || !/^\d{1,15}$/.test(version) || (path === "/catalog-page" &&
          (!page || !offset || !/^\d{1,9}$/.test(page) || !/^\d{1,7}$/.test(offset) || Number(offset) > 1_800_000 || Number(offset) % catalogChunkCharacters !== 0)))
          return json({ error: "Invalid catalog page" }, 400);
        const expression = path === "/catalog-pages" ?
          "(SELECT json_group_array(json_object('page', page, 'characters', length(entries))) FROM pages)" :
          "(SELECT substr(entries, ?, ?) FROM pages WHERE page = ?)";
        const params = path === "/catalog-pages" ? [] : [Number(offset) + 1, catalogChunkCharacters, Number(page)];
        const data = await env.DB.prepare(`${catalogPagesSql} SELECT ${expression} AS data FROM gameslash_state WHERE id = 1 AND version = ?`)
          .bind(...params, Number(version)).first<string>("data");
        if (data === null) return json({ error: "Catalog changed; restart the read" }, 409);
        if (!data.length) return json({ error: "Invalid catalog page offset" }, 400);
        return new Response(data, { headers: { "Content-Type": path === "/catalog-pages" ? "application/json" : "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (path === "/tags") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const data = await env.DB.prepare("SELECT COALESCE(json_extract(data, '$.customTags'), '[]') AS data FROM gameslash_state WHERE id = 1 AND data != '{}'").first<string>("data");
        return data === null ? json({ error: "D1 catalog has not been migrated" }, 503)
          : new Response(data, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
      if (path === "/catalog-chunk") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const version = url.searchParams.get("version"), offset = url.searchParams.get("offset"), part = url.searchParams.get("part");
        const entryId = url.searchParams.get("entryId");
        const summary = url.searchParams.get("summary") === "1";
        if (!version || !offset || !/^\d{1,15}$/.test(version) || !/^\d{1,7}$/.test(offset)
          || Number(offset) > 1_800_000 || Number(offset) % catalogChunkCharacters !== 0
          || !["state", "entries"].includes(part || "") || (summary && entryId === null) || (entryId !== null && !entrySchema.shape.id.safeParse(entryId).success))
          return json({ error: "Invalid catalog chunk" }, 400);
        const expression = part === "state" ? "s.data" : summary ? summaryExpression : entryId !== null
          ? "COALESCE((SELECT json_array(json(data)) FROM gameslash_entries WHERE id = ?), '[]')"
          : "(SELECT entries FROM gameslash_entry_snapshot WHERE id = 1 AND version = s.version)";
        const params = part === "entries" && entryId !== null ? [entryId] : [];
        const data = await env.DB.prepare(`SELECT substr(${expression}, ?, ?) AS data FROM gameslash_state s WHERE s.id = 1 AND s.version = ?`)
          .bind(...params, Number(offset) + 1, catalogChunkCharacters, Number(version)).first<string>("data");
        if (data === null) return json({ error: "Catalog changed; restart the read" }, 409);
        if (!data.length) return json({ error: "Invalid chunk offset" }, 400);
        return new Response(data, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (path === "/image-reservation" && request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      if (path === "/agent-auth" || path === "/likes") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const visitor = url.searchParams.get("visitor");
        if (path === "/likes" && (!visitor || !/^[a-f0-9]{64}$/.test(visitor)))
          return json({ error: "Invalid visitor" }, 400);
        const query = path === "/agent-auth"
          ? env.DB.prepare(`SELECT json_object('agents', json(COALESCE(json_extract(data, '$.agents'), '[]')),
              'oauthGrants', json(COALESCE(json_extract(data, '$.oauthGrants'), '[]'))) AS data
              FROM gameslash_state WHERE id = 1 AND data != '{}'`)
          : env.DB.prepare("SELECT COALESCE(json_extract(data, ?), '[]') AS data FROM gameslash_state WHERE id = 1 AND data != '{}'")
              .bind(`$.gameLikes."${visitor}"`);
        const row = await query.first<{ data: string }>();
        if (!row) return json({ error: "D1 catalog has not been migrated" }, 503);
        return new Response(row.data, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
      }
      if (path === "/notifications") {
        if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
        const [count, items] = await env.DB.batch([
          env.DB.prepare("SELECT count(*) AS total FROM gameslash_entries WHERE json_extract(data, '$.status') IN ('draft', 'pending')"),
          env.DB.prepare(`SELECT id, json_extract(data, '$.title') AS title,
            json_extract(data, '$.kind') AS kind, json_extract(data, '$.status') AS status,
            json_extract(data, '$.updatedAt') AS updatedAt FROM gameslash_entries
            WHERE json_extract(data, '$.status') IN ('draft', 'pending')
            ORDER BY json_extract(data, '$.updatedAt') DESC LIMIT 50`),
        ]);
        return json({ total: (count.results[0] as { total: number }).total, items: items.results });
      }
      if (request.method === "GET") {
        const entryId = url.searchParams.get("entryId");
        if (entryId !== null && !entrySchema.shape.id.safeParse(entryId).success)
          return json({ error: "Invalid entry ID" }, 400);
        if (url.searchParams.get("summary") === "1" && entryId === null) return json({ error: "Metadata reads require an entry ID" }, 400);
        if (url.searchParams.get("format") === "chunks") {
          const expression = url.searchParams.get("summary") === "1" ? summaryExpression : entryId !== null
            ? "COALESCE((SELECT json_array(json(data)) FROM gameslash_entries WHERE id = ?), '[]')"
            : "(SELECT entries FROM gameslash_entry_snapshot WHERE id = 1 AND version = s.version)";
          const statement = env.DB.prepare(`SELECT version, length(data) AS stateCharacters,
            length(${expression}) AS entryCharacters FROM gameslash_state s WHERE id = 1 AND data != '{}'`);
          const row = await (entryId !== null ? statement.bind(entryId) : statement)
            .first<{ version: number; stateCharacters: number; entryCharacters: number | null }>();
          return row ? json({ ...row, chunkSize: catalogChunkCharacters, supportsGameLikes: true, supportsFeedback: true, supportsStablePositions: true })
            : json({ error: "D1 catalog has not been migrated" }, 503);
        }
        // D1 batches are transactions: state and snapshot always describe the same version.
        let [state, entries] = await env.DB.batch([
          env.DB.prepare("SELECT version, data FROM gameslash_state WHERE id = 1"),
          entryId !== null ? env.DB.prepare("SELECT data FROM gameslash_entries WHERE id = ?").bind(entryId)
            : env.DB.prepare(`SELECT entries FROM gameslash_entry_snapshot WHERE id = 1 AND
            version = (SELECT version FROM gameslash_state WHERE id = 1)`),
        ]);
        let data = entryId !== null ? `[${(entries.results as { data: string }[]).map(row => row.data).join(",")}]`
          : (entries.results[0] as { entries: string | null } | undefined)?.entries;
        // shortcut: entry arrays above 1.8 MB or older writers use split rows; paginate if this becomes frequent.
        if (!data) {
          [state, entries] = await env.DB.batch([
            env.DB.prepare("SELECT version, data FROM gameslash_state WHERE id = 1"),
            env.DB.prepare("SELECT json_set(data, '$._d1Position', position) AS data FROM gameslash_entries ORDER BY position, id"),
          ]);
          data = `[${(entries.results as { data: string }[]).map(row => row.data).join(",")}]`;
        }
        const row = state.results[0] as { version: number; data: string } | undefined;
        if (!row || row.data === "{}") return json({ error: "D1 catalog has not been migrated" }, 503);
        // Stored JSON is validated on writes; avoid parsing and re-encoding the entire catalog on the Worker.
        return new Response(`{"version":${row.version},"supportsGameLikes":true,"supportsFeedback":true,"supportsStablePositions":true,"db":{${row.data.trim().slice(1, -1)},"entries":${data}}}`, {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
      // shortcut: bounded catalog requests up to 16 MB; use paginated operations for larger catalogs.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Missing body" }, 400);
      const chunks: Uint8Array[] = []; let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > (path === "/image-reservation" ? 1024 : 16 * 1024 * 1024)) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
        chunks.push(value);
      }
      const body = await new Blob(chunks).text();
      const input = JSON.parse(body);
      if (path === "/image-reservation") {
        const parsed = imageReservationSchema.safeParse(input);
        return parsed.success ? await reserveImage(parsed.data, env) : json({ error: "Invalid image reservation" }, 400);
      }
      const parsed = mutationSchema.safeParse(input);
      if (!parsed.success) return json({ error: "Invalid catalog mutation" }, 400);
      const { expectedVersion, initialize, stablePositions, state, changed, deleted } = parsed.data;
      const evidence = Object.entries(state.editorialQa).flatMap(([id, qa]) => qa.evidence ? [{ id, evidence: qa.evidence }] : []);
      for (const { id } of evidence) delete state.editorialQa[id].evidence;
      const stateJson = JSON.stringify(state);
      if (new TextEncoder().encode(stateJson).byteLength > 1_800_000)
        return json({ error: "Catalog state exceeds D1 row limit" }, 413);
      const queries = [env.DB.prepare(`INSERT OR REPLACE INTO gameslash_write_guard (id, valid)
        VALUES (1, (SELECT count(*) FROM gameslash_state
          WHERE id = 1 AND version = ? AND (? = 0 OR
            (data = '{}' AND NOT EXISTS (SELECT 1 FROM gameslash_entries)))))`)
        .bind(expectedVersion, Number(initialize))];
      if (parsed.data.ticket) queries.push(env.DB.prepare(`INSERT OR REPLACE INTO gameslash_write_guard (id, valid)
        VALUES (1, (SELECT count(*) FROM gameslash_write_queue WHERE ticket = ? AND status = 'running' AND expires > ?))`)
        .bind(parsed.data.ticket, Date.now()));
      if (evidence.length) queries.push(env.DB.prepare(`INSERT INTO gameslash_editorial_qa (entry_id, data)
        SELECT json_extract(value, '$.id'), json_extract(value, '$.evidence') FROM json_each(?) WHERE true
        ON CONFLICT(entry_id) DO UPDATE SET data = excluded.data`).bind(JSON.stringify(evidence)));
      // Old app instances send array offsets; normalize ranks atomically before their entry writes.
      if (!stablePositions && changed.length) queries.push(env.DB.prepare(`WITH ranked AS MATERIALIZED (
        SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS position FROM gameslash_entries
      ) UPDATE gameslash_entries SET position = ranked.position FROM ranked
        WHERE gameslash_entries.id = ranked.id AND gameslash_entries.position != ranked.position`));
      // JSON batches avoid D1's 100-bound-parameter and 50-query Free-plan limits.
      let group: typeof changed = []; let groupBytes = 0;
      function addGroup() {
        if (!group.length) return;
        queries.push(env.DB.prepare(`INSERT INTO gameslash_entries (id, position, data)
          SELECT json_extract(value, '$.data.id'), json_extract(value, '$.position'),
            json_extract(value, '$.data') FROM json_each(?) WHERE true
          ON CONFLICT(id) DO UPDATE SET position = excluded.position, data = excluded.data
          WHERE gameslash_entries.position != excluded.position OR gameslash_entries.data != excluded.data`)
          .bind(JSON.stringify(group)));
        group = []; groupBytes = 0;
      }
      for (const row of changed) {
        const size = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
        if (size > 1_800_000) return json({ error: "Entry exceeds D1 row limit" }, 413);
        if (groupBytes + size > 1_800_000) addGroup();
        group.push(row); groupBytes += size;
      }
      addGroup();
      if (deleted.length) queries.push(env.DB.prepare(
        "DELETE FROM gameslash_entries WHERE id IN (SELECT value FROM json_each(?))",
      ).bind(JSON.stringify(deleted)));
      // Older app schemas omit private state; preserve it during the rollout and rollback.
      let stateExpression = "?";
      for (const [key, fallback] of [["gameLikes", "{}"], ["feedback", "[]"], ["editorialQa", "{}"]]) {
        if (!Object.hasOwn(input.state, key))
          stateExpression = `json_set(${stateExpression}, '$.${key}', json(COALESCE(json_extract(data, '$.${key}'), '${fallback}')))`;
      }
      queries.push(env.DB.prepare(`UPDATE gameslash_state SET version = version + 1, data = ${stateExpression} WHERE id = 1`).bind(stateJson));
      // State-only writes reuse matching entries; stale snapshots from older writers are rebuilt.
      queries.push(env.DB.prepare(`INSERT OR REPLACE INTO gameslash_entry_snapshot (id, version, entries)
        SELECT 1, version, CASE WHEN ? = 0 AND EXISTS (SELECT 1 FROM gameslash_entry_snapshot WHERE id = 1 AND version = ?)
          THEN (SELECT entries FROM gameslash_entry_snapshot WHERE id = 1)
          WHEN (SELECT COALESCE(sum(length(CAST(data AS BLOB)) + 64), 0)
          FROM gameslash_entries) < 1800000 THEN
          (SELECT json_group_array(json(json_set(data, '$._d1Position', position))) FROM (SELECT data, position FROM gameslash_entries ORDER BY position, id))
          ELSE NULL END FROM gameslash_state WHERE id = 1`).bind(Number(changed.length > 0 || deleted.length > 0), expectedVersion));
      if (parsed.data.ticket) queries.push(env.DB.prepare("UPDATE gameslash_write_queue SET status = 'succeeded', result = ?, updated_at = ? WHERE ticket = ?")
        .bind(parsed.data.operationResult ?? null, Date.now(), parsed.data.ticket));
      await env.DB.batch(queries);
      return json({ version: expectedVersion + 1 });
    } catch (error) {
      if (error instanceof Error && error.message.includes("CHECK constraint failed: valid = 1"))
        return json({ error: "Catalog changed or target is not empty" }, 409);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      const message = error instanceof Error ? error.message : "";
      if (/D1's free tier daily row (?:read|write) limit/.test(message)) {
        const reset = (Math.floor(Date.now() / 86400000) + 1) * 86400000;
        console.error(JSON.stringify({ error: "D1_QUOTA_EXHAUSTED", path, method: request.method }));
        const response = json({ error: "Daily D1 quota exhausted", code: "D1_QUOTA_EXHAUSTED", resetAt: new Date(reset).toISOString() }, 503);
        response.headers.set("Retry-After", String(Math.ceil((reset - Date.now()) / 1000)));
        return response;
      }
      console.error(JSON.stringify({ error: "D1 catalog operation failed", path, method: request.method }));
      return json({ error: "D1 catalog operation failed" }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
