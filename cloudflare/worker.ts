import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { databaseSchema, entrySchema } from "../src/lib/model";

const mutationSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  initialize: z.boolean().default(false),
  stablePositions: z.boolean().default(false),
  state: databaseSchema.omit({ entries: true }),
  changed: z.array(z.object({ position: z.number().int(), data: entrySchema })).max(3000),
  deleted: z.array(entrySchema.shape.id).max(3000),
}).refine(input => new Set(input.changed.map(row => row.data.id)).size === input.changed.length);
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { "Cache-Control": "no-store" },
});

export default {
  async fetch(request, env) {
    const supplied = new TextEncoder().encode(request.headers.get("Authorization") || "");
    const expected = new TextEncoder().encode(`Bearer ${env.D1_SERVICE_TOKEN}`);
    if (!env.D1_SERVICE_TOKEN || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return json({ error: "Unauthorized" }, 401);
    const url = new URL(request.url);
    const path = url.pathname;
    if (!["/catalog", "/notifications", "/agent-auth", "/likes"].includes(path)) return json({ error: "Not found" }, 404);
    try {
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
        if (bytes > 16 * 1024 * 1024) { await reader.cancel(); return json({ error: "Catalog request too large" }, 413); }
        chunks.push(value);
      }
      const body = await new Blob(chunks).text();
      const input = JSON.parse(body);
      const parsed = mutationSchema.safeParse(input);
      if (!parsed.success) return json({ error: "Invalid catalog mutation" }, 400);
      const { expectedVersion, initialize, stablePositions, state, changed, deleted } = parsed.data;
      const stateJson = JSON.stringify(state);
      if (new TextEncoder().encode(stateJson).byteLength > 1_800_000)
        return json({ error: "Catalog state exceeds D1 row limit" }, 413);
      const queries = [env.DB.prepare(`INSERT OR REPLACE INTO gameslash_write_guard (id, valid)
        VALUES (1, (SELECT count(*) FROM gameslash_state
          WHERE id = 1 AND version = ? AND (? = 0 OR
            (data = '{}' AND NOT EXISTS (SELECT 1 FROM gameslash_entries)))))`)
        .bind(expectedVersion, Number(initialize))];
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
      for (const [key, fallback] of [["gameLikes", "{}"], ["feedback", "[]"]]) {
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
