# Gameslash D1 migration

The Next.js app stays on Vercel. A bearer-authenticated Worker exposes only catalog
and notification operations, using a D1 binding rather than the administration API.
Media stays in the existing Vercel Blob store. Postgres remains available for rollback.

## Status

- Account: `db30981724e7eb7a4367bca251e6c36d`
- Database: `gameslash-production` (`4ff63a76-fe44-4dbd-8c55-f40cc323beb4`)
- Worker: `https://gameslash-d1.gameslash.workers.dev`
- Neon rejects export with quota error `53000`. The owner explicitly authorized
  proceeding without its latest export on 2026-10-09.
- Restored `before-news-layout-1791512609715.json`: revision 251, 121 entries
  (118 published, 2 pending, 1 archived). Complete D1 readback matched the validated
  backup, including private state. A private copy is retained in ignored `.data`.
- Vercel production is configured for D1. Changes made after this backup may be absent.

## Deployment and cutover

1. Restore read access to the current Neon source. Do not use the older Blob or local
   snapshots unless the owner explicitly accepts losing later changes.
2. Authorize Wrangler for the existing Cloudflare account. Deploy with a new random
   server-only token stored using `wrangler secret put D1_SERVICE_TOKEN`. Never put
   the token in the config or Git. Store the matching token in Vercel as
   `GAMESLASH_D1_TOKEN` and the Worker HTTPS origin as `GAMESLASH_D1_URL`.
3. Apply `schema.sql` with `wrangler d1 execute gameslash-production --remote
   --config cloudflare/wrangler.jsonc --file cloudflare/schema.sql` and deploy with
   `wrangler deploy --config cloudflare/wrangler.jsonc`.
4. Freeze writes in the deployed production app with `GAMESLASH_READ_ONLY=true` and
   redeploy. Keep `GAMESLASH_STORAGE=postgres` until export and verification finish.
5. With the frozen production Postgres credentials and D1 URL/token loaded privately,
   run `npx tsx scripts/migrate-d1.ts`. This saves a private backup, refuses to overwrite
   an initialized target, compares the complete target with the source, and checks
   that the source did not change during export.
6. Verify a Vercel preview with `GAMESLASH_STORAGE=d1` and writes still frozen.
   Check public pages, admin reads, draft visibility, media and MCP/OAuth access.
7. Deploy the reviewed code to production with `GAMESLASH_STORAGE=d1`, verify all
   production aliases, then remove the write freeze. Preserve Neon and the backup.

Rollback before D1 accepts new writes: return storage to `postgres` and redeploy.
After D1 accepts writes, freeze them and export/reconcile those changes first; switching
back to the old Neon snapshot directly would lose changes made after cutover.

## Local verification

Use a fresh `--persist-to .data/d1-test-<unique-run>` directory for each integration
run, for both the schema command and `wrangler dev --local`. These commands must not
use `--remote`. Put a random test token in ignored `cloudflare/.dev.vars` as
`D1_SERVICE_TOKEN`, then generate types:

```
npx wrangler types --config cloudflare/wrangler.jsonc --env-interface Env cloudflare/.types/env.d.ts
npx tsc -p cloudflare/tsconfig.json --noEmit
```

Set `GAMESLASH_TEST_D1_URL` to the local Worker origin and
`GAMESLASH_TEST_D1_TOKEN` to the local token, then run `npx tsx --test tests/d1.test.ts`.
The test refuses non-localhost destinations and requires an empty test catalog.
Unset the test variables before running the general suite.

The Worker rejects catalog mutations over 16 MB and individual state/entry rows
over 1.8 MB. Split entries remain individually addressable; writes update only changed
entries. Catalog writes use an atomic version check, including OAuth/rate-limit updates
that do not bump the user-visible revision. Notification polling reads indexed draft
metadata only. Full catalog reads use the matching versioned entry snapshot below.

Cloudflare Free query, row and CPU limits still apply. This migration removes Neon's
egress dependency; it does not provide unlimited database usage.

## MCP reliability

Catalog GET reads state and a matching `gameslash_entry_snapshot` in a D1 transaction.
The snapshot stores only the entry array, separately from private state, and is updated
atomically with entries and the storage version. State-only writes reuse the array;
changed entries rebuild it once. Arrays over 1.8 MB or stale snapshots from older
writers fall back to split rows. Worker responses join validated stored JSON without
parsing and re-encoding the entire catalog. The app still validates the response schema.

Every MCP request checks current credentials through `/agent-auth`. Initialization,
tool discovery and editorial guidance do not load catalog entries. Catalog tools load
the full snapshot lazily at most once per request; `get_entry` selects one entry.
Existing visitors read their own IDs through `/likes`; new visitors need no database
read. All Worker endpoints require the server-only service token. Public filtering,
draft ownership, review permissions and fresh checks before mutations remain in the app.
No authorization cache is shared between requests.

Clients receive operating instructions during MCP initialization and through
`get_editorial_skills` (`mcp-operation`). Calls should be sequential. A 401 means
stop and repair authorization. Retry transient storage failures only when `retryable`
is true, observing `Retry-After`. `QUOTA_EXHAUSTED` sets `retryable: false` and a
`resetAt` at UTC midnight (07:00 Bangkok). Each app instance suppresses further D1
calls until then and resumes automatically; this is not a shared account-wide gate.
`OUTCOME_UNKNOWN` sets `retryable: false`: read back before deciding whether to replay
a write, retaining draft request IDs. The server never automatically replays uncertain
catalog writes. Instructions cannot force a third-party agent to obey; enforce client call
concurrency and retry limits when its settings permit.

## Read-budget rollout on the existing D1 deployment

1. After the daily reset, apply the additive `schema.sql` to the existing database.
   It creates/backfills the snapshot and leaves entries and state intact. Do not run
   `migrate-d1.ts` or initialize an already live catalog. Keep the existing service token.
2. Deploy the Worker, then verify authorized `/agent-auth`, scoped `/catalog?entryId=...`,
   and full `/catalog` reads privately. Do not publish response bodies or credentials.
3. Deploy the Next.js app. Deploying it before the Worker would call unavailable endpoints.
4. Once storage works, refresh the MCP connection once to obtain the new initialization
   instructions. Do not reconnect repeatedly while quota is exhausted.
5. Compare D1 `rows_read`, write counts, CPU failures and MCP error rates after real use.
   Local checks do not prove production stays below Workers Free's CPU limit.

Rollback the app before the Worker. Leave the additive table in place; older writers
advance the state version, so a newer Worker detects the stale snapshot and falls back
without serving stale entries. Waiting for reset alone restores the budget but does not
fix repeated scans. See [the evidence and decision](../docs/decisions/001-d1-read-budget.md).

### Write-budget follow-up

Catalog image uploads allow 200 new reservations per agent per hour and 1,000
shared per 24-hour window. Existing counters keep their reset times; raising the
cap takes effect immediately without clearing receipts. Feedback uploads retain
40/hour and 200/day. `IMAGE_UPLOAD_LIMIT` reports scope, cap and `resetAt` with
HTTP 429/Retry-After, separately from database quota and service outages. Identical
reserved images remain retryable without another charge. Provider quotas still apply.

Deploy the Worker before the app; no schema migration is required. New apps retain
integer storage ranks for prepends, appends and deletes rather than rewriting every
array offset. Old app instances are supported by transactional rank normalization.
Unchanged validated saves skip the PUT and do not advance revisions. Reorders and
middle inserts may still rebalance positions.

Rollback the app while leaving the new Worker running. To also roll back the Worker,
first normalize ranks and invalidate the snapshot in a single D1 batch:

```sql
WITH ranked AS MATERIALIZED (
  SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS position FROM gameslash_entries
) UPDATE gameslash_entries SET position = ranked.position FROM ranked
  WHERE gameslash_entries.id = ranked.id AND gameslash_entries.position != ranked.position;
UPDATE gameslash_entry_snapshot SET entries = NULL WHERE id = 1;
```

This is a rollback-only operation, not a deployment migration. Do it with writes
paused so a stable-rank app cannot race the old Worker's activation. Preserve the
current state and entries; do not initialize or replace the production catalog.

## Feedback rollout

Deploy the Worker before the app: catalog responses advertise `supportsFeedback`,
and the app refuses feedback writes to older Workers. Feedback image files stay
in the private `feedback/` Blob namespace and require an admin session to view.
Older apps that omit feedback in their catalog writes retain existing tickets.
No database migration or catalog replacement is needed for this rollout.

## Image-upload reliability rollout

Apply the additive image-reservation table/index in `schema.sql`, then deploy the
Worker before the app. Do not initialize or replace the live catalog. The new
`PUT /image-reservation` accepts at most 1 KiB and projects only current agent
permissions and two rate counters. A version-guarded D1 batch updates counters,
stores a 24-hour receipt and advances an already matching snapshot version without
reading or rewriting its entries. Old writers still share the same counters and CAS
version. Hourly/daily limits and the read-only switch remain enforced.

The same agent, namespace and normalized image hash reuse a receipt after a lost
reply or Blob failure. Expired receipts are deleted through an expiry index on the
next new reservation. Only this operation retries ambiguous responses (at most
two retries, five-second request deadlines); catalog mutations keep their existing
read-back requirement. Blob writes use the same content-hashed pathname on retry.
MCP `upload_image` describes safe retries; tool errors are logged by code without
payloads or credentials. Refresh the MCP connection once after the app deploy.

Rollback the app while leaving the Worker and additive table in place. Receipts
are private operational state, never included in catalog/MCP reads. Isolated D1
tests exercise lost successful responses, simultaneous duplicates, storage failures,
counter resets, daily/hourly rejection, revoked/expired permissions and namespace
isolation. Continue checking production resource outcomes: these tests cannot prove
that every catalog mutation fits Workers Free's CPU allowance.

## Catalog CPU follow-up

Real-time logs on 2026-10-10 confirmed `GET /catalog` failing with `exceededCpu`,
including 10–31 ms CPU time while D1 daily quotas remained available. Sending one
large D1 result through the Worker exceeded Free's per-request CPU budget even
without parsing the catalog JSON in application code.

Deploy the Worker before the app; no schema change is required. New readers request
`/catalog?format=chunks`, then retrieve state/entries in at most 32,768 SQLite
characters per `/catalog-chunk` request (at most 128 KiB of UTF-8). Four requests
run concurrently. Every chunk checks the manifest's storage version; a concurrent
write restarts the whole read, never assembles mixed versions. Validation and JSON
assembly stay on Vercel. Scoped entry reads use the same protocol. Older Workers
ignore `format` and retain their original response; old apps still work with the
new Worker. Arrays beyond the existing 1.8 MB snapshot bound use version-bound
byte-weighted `/catalog-pages` and `/catalog-page` chunks, rather than a large
legacy response. Each page remains within D1's single-value limit.

Public home/section/detail/sitemap reads share a 30-second Next.js data cache that
contains only published entries and the public layout. React deduplicates metadata
and page reads in one render. Warm public reads can survive a temporary storage
failure; cold reads still need working storage. Auth, management and MCP mutation
snapshots never use this cache. Public edits may appear after revalidation; do not
use public cache data to make editing decisions. `/tags` projects only the public
custom-tag registry rather than reading the catalog.

Isolated D1 checks cover multi-chunk Thai/emoji JSON, concurrent-version changes,
scoped/missing entries, invalid offsets, authentication and large-array pagination.
A built Next.js fixture verifies home/games/detail reuse public data during a
simulated D1 outage, private drafts/feedback never appear, and fresh private reads
still fail rather than serving stale edit state. Verify the actual production
CPU outcomes after rollout; local fixtures do not reproduce the Free CPU limit.

## Three-agent writes and editorial QA

Apply `schema.sql` to add `gameslash_write_queue` and `gameslash_editorial_qa`, then
deploy the Worker before the Vercel app. This is additive: never initialize or
replace the production catalog. Keep service tokens, OAuth identities and grants.
Older apps remain compatible. Roll back the app first and retain the new Worker
and tables, so old writers continue preserving QA metadata.

All MCP catalog mutations use durable FIFO tickets. Each invocation waits at most
eight seconds for its turn; a claimed ticket lasts sixty seconds. The catalog's
transaction checks both the ticket and storage version, preventing an expired
writer from committing after another ticket starts. A successful catalog commit
also stores its receipt atomically. Failed/finished receipts are retained at least
seven days; expired running tickets become `unknown` and are never replayed
automatically. This is coordination of incoming requests, not a background agent
runner: a stopped client must reconnect, inspect the receipt and reconcile.
Image uploads retain their existing independent hash reservation receipts.

Use one identity per client, sequential tool calls per client and a stable
`operationId` for each logical mutation (`create_draft` uses its existing
`requestId`). `get_operation_status` is scoped to the authenticated agent and
reports queued/running/succeeded/failed/unknown. Payload changes cannot reuse an
operation ID. Duplicate succeeded entry operations read the current entry without
replaying the callback. Receipt results record the committed entry ID/updatedAt
and revision; current content may have changed afterwards. Draft-only permissions
still cannot edit another client's draft or publish. No permissions are widened.

MCP lookup tools read metadata; entry mutations read metadata for duplicate checks
and the full target entry only. Scoped updates reject changes, deletions or position
changes to other entries. Full Console edits retain the existing validated CAS
path. Local/Blob/Postgres retain their existing concurrency controls; the durable
ticket/status protocol is specific to the current D1 production backend.

Drafts may be saved incomplete. News entries (`kind: article`) do not require a QA
receipt for submission, publication, edits or restoration; permissions, validation,
revision checks and operation receipts still apply. Research and image rights still
need checking. Other entry kinds require current QA before agent publication.
For entries requiring QA before submission or agent publication, call
`get_entry`, inspect sources, images, links and desktop/mobile rendering, then
`record_entry_qa`. Evidence includes claims with original source URLs and dates,
rights/credit/inspection for every image, checked links and render observations.
Missing images require a reason. Image credit must also be visible in the article.
Authenticated human Console saves/reviews do not require MCP QA receipts. Agent
submission, publication and restoration of non-news entries remain QA-gated at MCP boundaries;
manual edits do not fabricate QA evidence for later agent writes.
The server requires evidence matching the content hash and checked within seven
days, and returns `QA_REQUIRED` for missing/stale evidence. Editing content, links,
images or tags invalidates the hash. QA itself does not publish or grant approval.

Managers can provide the exact `proposedEntry` to QA a live replacement before
publishing it, without unpublishing the existing article. This proof is also bound
to the existing `updatedAt`. Re-read site revision before the actual save. Evidence
is private and stored separately from the small catalog state; only ownership or
site-management permission allows MCP reads. Public entries never carry QA.

Source truth, image licensing and visual observations are client-reported evidence,
not independently certified by the server. The agent still needs browsing and
image inspection tools and user authorization. Passing a schema is not proof of
editorial quality. No tool automatically fetches arbitrary evidence URLs.

Isolated HTTP/D1 tests exercise three concurrent clients, unchanged content,
lost commit responses, receipt isolation, all QA gates and a staged live edit.
Run `npm run test:d1` to compile the current Worker and exercise those tests against
an in-memory localhost D1, including FIFO and an expired-ticket fencing assertion.
Recheck production CPU/errors and daily request/read/write budgets after rollout;
serialization reduces conflict traffic but does not increase Free plan quotas.
Large catalogs materialize byte-weighted pages in the same transaction as content
writes. Each chunk reads indexed state/page rows; state-only writes advance page
versions without rebuilding content. Rebuilding pages still consumes write quota.
Rollback the app while leaving the backward-compatible Worker deployed.
