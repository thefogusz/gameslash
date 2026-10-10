CREATE TABLE IF NOT EXISTS gameslash_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
INSERT OR IGNORE INTO gameslash_state VALUES (1, 0, '{}');
CREATE TABLE IF NOT EXISTS gameslash_entries (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data) AND json_extract(data, '$.id') = id)
);
CREATE INDEX IF NOT EXISTS gameslash_entry_status ON gameslash_entries (json_extract(data, '$.status'));
-- A version-matched snapshot avoids scanning every entry on each catalog read.
CREATE TABLE IF NOT EXISTS gameslash_entry_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  entries TEXT CHECK (entries IS NULL OR json_valid(entries))
);
INSERT OR IGNORE INTO gameslash_entry_snapshot (id, version, entries)
SELECT 1, version, CASE WHEN (SELECT COALESCE(sum(length(CAST(data AS BLOB)) + 1), 0)
  FROM gameslash_entries) < 1800000 THEN
  (SELECT json_group_array(json(data)) FROM (SELECT data FROM gameslash_entries ORDER BY position, id))
  ELSE NULL END FROM gameslash_state WHERE id = 1;
-- A failed compare-and-swap aborts the entire D1 batch before any catalog write.
CREATE TABLE IF NOT EXISTS gameslash_write_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  valid INTEGER NOT NULL CHECK (valid = 1)
);
-- Short-lived receipts make retrying the same image reservation safe.
CREATE TABLE IF NOT EXISTS gameslash_image_reservations (
  key TEXT PRIMARY KEY,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gameslash_image_reservation_expiry ON gameslash_image_reservations (expires);
-- Durable FIFO tickets and receipts finish atomically with catalog commits.
CREATE TABLE IF NOT EXISTS gameslash_write_queue (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket TEXT NOT NULL UNIQUE,
  agent_id TEXT, request_id TEXT, tool TEXT, input_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'unknown')),
  expires INTEGER NOT NULL, updated_at INTEGER NOT NULL, result TEXT,
  UNIQUE(agent_id, tool, request_id)
);
CREATE INDEX IF NOT EXISTS gameslash_write_queue_active ON gameslash_write_queue(status, sequence);
CREATE INDEX IF NOT EXISTS gameslash_write_queue_expiry ON gameslash_write_queue(expires);
-- Evidence is separate from the small catalog state and is read only for one entry.
CREATE TABLE IF NOT EXISTS gameslash_editorial_qa (
  entry_id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE TABLE IF NOT EXISTS gameslash_catalog_pages (
  page INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
INSERT OR IGNORE INTO gameslash_catalog_pages (page, version, data)
WITH ranked AS (SELECT data, position,
  sum(length(CAST(data AS BLOB)) + 64) OVER (ORDER BY position, id) AS bytes
  FROM gameslash_entries WHERE (SELECT entries IS NULL FROM gameslash_entry_snapshot WHERE id = 1))
SELECT CAST(bytes / 32768 AS INTEGER), (SELECT version FROM gameslash_state WHERE id = 1),
  json_group_array(json(json_set(data, '$._d1Position', position))) FROM ranked GROUP BY 1;
