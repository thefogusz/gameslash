# 001: Reduce D1 reads without a paid upgrade

Date: 2026-10-10 (Bangkok)

Status: Accepted; implemented and validated for production rollout.

## Evidence

Production returned Cloudflare's explicit free-tier daily **row-read** quota error.
This is independent of Workers request counts or Cloudflare administration API limits.
The UTC 2026-10-09 account sample recorded 5,285,663 rows read, 16,170 read queries,
and 38,103 rows written. The two full-catalog SQL variants accounted for 5,091,237
rows, about 96.3% of sampled reads. A catalog GET measured 844 rows read for 281 entries.
Entries occupied about 915 KB and private state about 636 KB; storage size was not
the exhausted limit. The query and usage evidence is a private diagnostic export.

Fifty Codex MCP requests returned 503 in 21 seconds **after** exhaustion. This shows
repeated failed calls, not which agent consumed the earlier quota. Samples are not
complete client attribution, so do not blame Dots or treat all queries as MCP calls.

[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) documents the
Free allowance of 5 million rows read and 100,000 rows written per day.
[Quota enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
started September 1, 2026; exhausted daily budgets recover at midnight UTC, or 07:00
Bangkok. Waiting is the selected immediate recovery because the owner has a small budget.

## Decision

Keep the existing Vercel app, Worker, D1 database and service token. Add a materialized
entry-array snapshot, separate from private state, and bind it to D1's storage version.
Read state and snapshot in a batch. Every mutation writes data, version and snapshot in
one atomic batch. State-only changes reuse matching entries; changed entries rebuild
once. A stale snapshot from an older writer is bypassed and repaired on the next write.
This uses [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
and [SQLite JSON functions](https://developers.cloudflare.com/d1/sql-api/query-json/).

Keep authentication fresh but project only agents and OAuth grants for MCP setup.
Load catalogs only when a tool needs them, select one entry for `get_entry`, and read
only the visitor's saved likes for returning visitors. Existing permission checks and
private review filtering remain; initialization is not anonymous.

Recognize daily quota errors, report the UTC reset time, and suppress more D1 calls
within each app instance until that time. Resume automatically after reset. Distinguish
an uncertain write from a safe read retry. Preserve idempotency IDs and require readback
before replay. Advertise sequential calls and bounded retries in the canonical handbook.
This follows [AWS guidance on retries and uncertain side effects](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/).

## Alternatives and tradeoffs

- **Pay $5:** larger included limits, but no guarantee against inefficient code or
  further charges. The owner chose no new spend. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- **Add indexes only:** useful for filtered reads, but full-table catalog scans still
  visit every row. Scoped entry reads now use the existing primary key.
  [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).
- **Edge Cache API / KV:** adds cache invalidation and stale authorization concerns;
  Workers Cache API is local to each data center. A database versioned snapshot uses
  the existing atomic write boundary. [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
- **Move database or add replicas:** does not directly fix reading the complete catalog
  for discovery, and another provider already hit a quota. Avoid another migration now.
- **Rewrite every tool to normalized SQL:** a useful growth path, but expands the current
  change across editorial state, OAuth, concurrency and permissions. The snapshot
  achieves the current read-budget goal with less migration risk.

Public MCP incidents confirm that clients can behave poorly around rate errors, but
none proves our incident's cause: [AWS MCP initialization issue](https://github.com/awslabs/mcp/issues/2949)
and [OpenCode tool rate-limit issue](https://github.com/anomalyco/opencode/issues/16993).
The proposed AWS retry fix [PR 3011](https://github.com/awslabs/mcp/pull/3011) closed
without merging; it is not evidence of a released fix. Server instructions alone are
not an enforceable Dots scheduler. Limit parallel calls/retries in the client as well.

## Validation and remaining limits

An isolated local D1/Miniflare fixture with 281 entries measured **844 → 3 rows read**
for the full-catalog SQL path, about a 99.64% reduction. This is a local measurement,
not post-deployment production telemetry. Readback was identical. Checks also covered
state-only snapshot reuse, old-writer fallback/repair, concurrent CAS conflicts,
rollback, JSON ordering, likes, credentials, private drafts and large-catalog fallback.
The Next.js production build and Worker TypeScript check passed. Full tests: 108
passed, 2 opt-in database tests skipped; the local D1 integration was run separately.
The HTTP MCP workflow and visitor likes/undo checks passed against local D1, as did
backfilling and rerunning the additive schema on an already populated fixture.

A production read of a single state row through Wrangler was rejected with Cloudflare
error `7500` before reset. A subsequent deployment check found that the schema-file
import path still accepted the additive migration: 7 queries, 846 rows read and 1 row
written. The snapshot was backfilled without replacing catalog entries or private
state, and Worker version `13769f18-434b-446b-879a-6a253287ee01` deployed successfully.
This does not reset the daily read allowance; ordinary reads may stay blocked until
UTC midnight. Keep the schema-first order and verify actual serving after deployment.

The entry snapshot is bounded to 1.8 MB to leave room under D1's 2 MB value limit;
private state is separate. Larger arrays fall back to scans, so paginate before that
becomes common. Materialization shifts scans to entry-changing writes. Free write,
Worker request and CPU limits still apply. The per-instance quota gate does not stop
other app instances or unrelated database consumers, and persists until midnight even
if someone upgrades early. No paid service, production content replacement or automatic
07:00 deployment has been scheduled. Apply schema → Worker → app; see the
[rollout instructions](../../cloudflare/README.md#read-budget-rollout-on-the-existing-d1-deployment).

## Write-budget follow-up (2026-10-10)

At 14:44 Bangkok the live account recorded 119,084 rows read and 31,263 rows written
since 07:00. This aggregate does not identify Dots or individual query costs. The
code and an isolated D1 reproduction identified an avoidable cost: prepending an
entry changed every subsequent array offset, so the client upserted unchanged
entries and maintained their indexes. A no-op save also advanced the version.

Keep integer storage ranks when prepending, appending or deleting. The Worker
includes private `_d1Position` metadata in the existing snapshot; application
schemas remove it from returned entries. The client uses ranks only when the
Worker advertises `supportsStablePositions`. Explicit reorders, middle inserts
and exhausted integer bounds rebalance ranks. Unchanged validated saves return
without a PUT or revision increment; revision checks still reject stale callers.

Old app instances keep their array-offset protocol. The new Worker normalizes
ranks inside the same guarded transaction before an old client's entry mutation.
This may temporarily retain the former write cost during the app rollout. No
table migration is needed. Deploy the Worker before the app. To roll back the
app, leave the new Worker running. Before rolling back the Worker too, normalize
entry positions to array offsets and invalidate/rebuild the snapshot atomically;
an older Worker does not understand stable ranks.

An isolated Miniflare/D1 fixture with 281 entries measured prepend writes
**568 → 6**, deletion writes **506 → 4**, and no-op writes **3 → 0**. These are
local measurements, not a promise about total production usage. Tests cover
readback, revision conflicts, middle inserts, explicit reorder, mixed old/new
writers and large-catalog fallback. Existing daily usage is not refunded. Real
content changes, authentication state, likes and audit events still consume
writes; snapshot rebuilds still scan entries on entry-changing mutations.
