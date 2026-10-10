import { queueRequestSchema, operationContextSchema } from "../src/lib/write-queue";

export async function writeQueue(request: Request, env: Env) {
  const now = Date.now();
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const agentId = params.get("agentId"), requestId = params.get("requestId"), tool = params.get("tool");
    if (!operationContextSchema.omit({ inputHash: true }).safeParse({ agentId, requestId, tool }).success) return json({ error: "Invalid operation" }, 400);
    const row = await env.DB.prepare(`SELECT ticket, CASE WHEN status = 'running' AND expires <= ? THEN 'unknown'
      WHEN status = 'queued' AND expires <= ? THEN 'failed' ELSE status END AS status, result, updated_at AS updatedAt
      FROM gameslash_write_queue WHERE agent_id = ? AND request_id = ? AND tool = ?`)
      .bind(now, now, agentId, requestId, tool).first();
    return json({ operation: row });
  }
  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing body" }, 400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 2048) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
    chunks.push(value);
  }
  const body = await new Blob(chunks).text();
  const parsed = queueRequestSchema.safeParse(JSON.parse(body));
  if (!parsed.success) return json({ error: "Invalid queue request" }, 400);
  const { ticket, action, operation } = parsed.data;
  if (action === "enqueue") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM gameslash_write_queue WHERE expires <= ? AND status IN ('succeeded', 'failed')").bind(now - 7 * 86400000),
      env.DB.prepare(`UPDATE gameslash_write_queue SET status = CASE WHEN status = 'running' THEN 'unknown' ELSE 'failed' END,
        updated_at = ? WHERE status IN ('queued', 'running') AND expires <= ?`).bind(now, now),
      env.DB.prepare(`INSERT OR IGNORE INTO gameslash_write_queue
        (ticket, agent_id, request_id, tool, input_hash, status, expires, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`)
        .bind(ticket, operation?.agentId ?? null, operation?.requestId ?? null, operation?.tool ?? null, operation?.inputHash ?? null, now + 60_000, now),
      env.DB.prepare(`UPDATE gameslash_write_queue SET ticket = ?, sequence = (SELECT max(sequence) + 1 FROM gameslash_write_queue),
        status = 'queued', result = NULL, expires = ?, updated_at = ?
        WHERE agent_id = ? AND request_id = ? AND tool = ? AND input_hash = ? AND status = 'failed'`)
        .bind(ticket, now + 60_000, now, operation?.agentId ?? null, operation?.requestId ?? null, operation?.tool ?? null, operation?.inputHash ?? null),
    ]);
    const row = await env.DB.prepare(`SELECT ticket, status, result, input_hash AS inputHash, updated_at AS updatedAt FROM gameslash_write_queue
      WHERE ticket = ? OR (agent_id = ? AND request_id = ? AND tool = ?) LIMIT 1`)
      .bind(ticket, operation?.agentId ?? null, operation?.requestId ?? null, operation?.tool ?? null).first<{ ticket: string; status: string; result: string | null; inputHash: string | null; updatedAt: number }>();
    if (!row || (operation && row.inputHash !== operation.inputHash)) return json({ error: "Operation ID already used with different input" }, 409);
    // A second invocation must not take over a running ticket.
    return json(row);
  }
  if (action === "claim") {
    await env.DB.prepare(`UPDATE gameslash_write_queue SET status = 'running', expires = ?, updated_at = ?
      WHERE ticket = ? AND status = 'queued' AND expires > ? AND sequence =
      (SELECT min(sequence) FROM gameslash_write_queue WHERE status IN ('queued', 'running') AND expires > ?)`)
      .bind(now + 60_000, now, ticket, now, now).run();
  } else if (action === "cancel") {
    await env.DB.prepare("UPDATE gameslash_write_queue SET status = 'failed', updated_at = ? WHERE ticket = ? AND status = 'queued'").bind(now, ticket).run();
  } else {
    await env.DB.prepare("UPDATE gameslash_write_queue SET status = ?, result = ?, updated_at = ? WHERE ticket = ? AND status = 'running'")
      .bind(parsed.data.outcome ?? "unknown", parsed.data.result ?? null, now, ticket).run();
  }
  const row = await env.DB.prepare("SELECT ticket, status, result, updated_at AS updatedAt FROM gameslash_write_queue WHERE ticket = ?").bind(ticket).first();
  return row ? json(row) : json({ error: "Unknown queue ticket" }, 404);
}
