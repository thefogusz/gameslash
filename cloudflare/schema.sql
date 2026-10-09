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
