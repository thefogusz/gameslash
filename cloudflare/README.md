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
metadata only. Other existing catalog reads still fetch the full catalog.

Cloudflare Free query, row and CPU limits still apply. This migration removes Neon's
egress dependency; it does not provide unlimited database usage.

## MCP reliability

Catalog GET responses assemble validated stored JSON in SQLite below 1.8 MB;
larger catalogs join split JSON rows without parsing and re-encoding every entry
on the Worker. The app still validates the response schema.
MCP read tools reuse the authentication snapshot within a single HTTP request;
mutations still read fresh state and retain atomic revision checks. No catalog or
authorization cache is shared between requests.

Clients receive operating instructions during MCP initialization and through
`get_editorial_skills` (`mcp-operation`). Calls should be sequential. A 401 means
stop and repair authorization; transient storage failures return 503 with
`Retry-After`, `SERVICE_UNAVAILABLE`, and `retryable`. Failed writes can report
`outcomeUnknown`: read back before retrying and retain draft request IDs.
The server does not automatically replay uncertain writes.

Deploy the Worker and Next.js app separately to activate both changes. Reconnect
MCP clients so they receive the new initialization instructions. Local checks do
not prove the production catalog stays below Workers Free's CPU limit; verify
`exceededCpu` events after rollout.

## Feedback rollout

Deploy the Worker before the app: catalog responses advertise `supportsFeedback`,
and the app refuses feedback writes to older Workers. Feedback image files stay
in the private `feedback/` Blob namespace and require an admin session to view.
Older apps that omit feedback in their catalog writes retain existing tickets.
No database migration or catalog replacement is needed for this rollout.
