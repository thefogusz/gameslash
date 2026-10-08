# gameslash

A Thai AI-game directory, maker resources, and a small moderated community. Games link to their creators' websites. No game embedding, hosting, or game-file uploads.

## Local development

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3020`. The original reference is `mockups/lucid-arcade-shelves.html`. The current design follows its dark sidebar, featured mosaic and horizontal game shelves.

The initial catalog contains six real outbound game links, four tools, two original starter articles and one team welcome post. It contains no invented popularity counts or member activity. The initial links are editorial selections, not a claim that each game has been played or independently endorsed.

## Administration

Copy `.env.example` to `.env.local`, set `ADMIN_PASSWORD` to at least 24 random characters and `SESSION_SECRET` to at least 32 random characters, then restart the server. Never use `NEXT_PUBLIC_` for either value. The initial local setup generated these values and saved the local login information in `.data/admin-access.txt`, excluded from source control and deployments.

Visit `/admin`. The studio supports:

- Creating/editing games, tools, articles and community posts.
- Moderating visitor submissions. Public submissions always start pending.
- Soft archiving and republishing records.
- Selecting featured games, ordering homepage sections, filtering sections by category, choosing shelf/grid/list templates, and editing navigation categories.
- Saving layout drafts independently from the published layout.
- Importing up to 50 JSON records at once as drafts. The import screen documents the format. A duplicate game/tool URL rejects the whole batch.
- Exporting catalog entries to JSON. Import accepts that export format but intentionally assigns fresh IDs and draft status; duplicate links are still rejected. This is an editorial import, not a full database restore.

`POST /api/manage` is authenticated and requires the current revision plus a matching Origin. The browser interface is the supported management surface; do not give agents the administrator password in prompts. Agents can prepare JSON for review and import.

## Deploy to Vercel

Production is live at https://gameslash.vercel.app under `kirdssadee-4203s-projects/gameslash`. The catalog uses Neon PostgreSQL Free in Singapore (`sin1`), connected to Production only through the Vercel native integration. The original private Blob catalog is retained as a pre-migration backup. Production administrator access is saved locally in `.data/production-admin-access.txt`, excluded from source control and deployment uploads.

The machine has Vercel CLI authentication, the user-scoped Vercel plugin, and an OAuth-authenticated shared MCP connection to `https://mcp.vercel.com` in `C:/Users/Gus/.codex/config.toml`. Start a fresh Codex session to load newly installed tools; authenticated MCP tool calls have not yet been verified in the installing session.

For a separate installation:

1. Run `vercel login`, then `vercel link --project gameslash` in this directory. Create the project if prompted, selecting Next.js.
2. In that project's Storage tab, create and connect a **private Vercel Blob** store. This catalog uses private storage because pending posts and unpublished layouts must not be public. Connect Production and Preview deliberately; use separate stores if previews must not modify production content.
3. Add `ADMIN_PASSWORD` and `SESSION_SECRET` to the relevant Vercel environments using the dashboard or `vercel env add`. Generate production secrets separately from local development. The connected store supplies `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` with Vercel OIDC.
4. Run `npm test`, `npm run typecheck`, `npm run build` and then `vercel --prod`.
5. Verify the deployed `/admin` login, draft/save/publish flow and public submission. The deployed store starts from the seed catalog; local `.data` is never uploaded. Make editorial changes after connecting the desired store.

The setup above describes the legacy Blob backend. For PostgreSQL, follow the migration below before enabling `GAMESLASH_STORAGE=postgres`. Once enabled, missing credentials, missing tables or database errors fail explicitly; the app never falls back to stale Blob data. Previews are not connected to the production database.

### Migrate an existing catalog to PostgreSQL

1. Create a Neon Free database through Vercel Marketplace, in the same region as the application. Connect Production only. Use the pooled `DATABASE_URL` supplied by the integration; keep all database credentials server-side.
2. Deploy the current code with `GAMESLASH_READ_ONLY=true` and `GAMESLASH_STORAGE` unset. Public pages still read the legacy catalog. Verify submissions return 503, and allow in-flight writes to finish before copying.
3. Pull production environment variables into a private, ignored file, for example `.data/neon-production.env`. With the same read-only flag set in the migration process, run `node --env-file=.data/neon-production.env --import tsx scripts/migrate-postgres.ts`.
4. The script writes a full `.data/catalog-before-postgres-*.json` backup, creates tables, copies entries/layouts/revision/rate limits in one transaction, and verifies exact equality. It refuses a nonempty destination. Keep the private backup; it contains unpublished content and rate-limit identifiers.
5. Set `GAMESLASH_STORAGE=postgres`, remove `GAMESLASH_READ_ONLY`, then redeploy. Verify login, draft saving, moderation and public pages against the new database.

If migration fails before cutover, leave PostgreSQL disabled and remove the read-only flag to resume the original store. After PostgreSQL accepts writes, **do not roll back to an old Blob-only deployment**: its catalog is stale. Roll back only to PostgreSQL-compatible code, or freeze writes and explicitly export/reconcile current PostgreSQL data first. Deploy rollback does not roll back data.

## Storage and safety

Local development defaults to an atomically replaced JSON file under `.data/`, with a write lock. PostgreSQL stores each entry in its own row and keeps layouts, revision and rate limits in a state row. Updates write changed rows inside a transaction; a state-row lock preserves the current catalog-wide revision contract and prevents lost updates. Single-statement reads see consistent entries and layouts. The studio rejects stale revisions rather than overwriting newer edits.

Blob reads request identity encoding: compressed responses can carry weak ETags that cannot be used for conditional writes. This was verified against the real private store during deployment.

This is a small editorial CMS, capped at 3,000 entries. Reads still load the whole catalog, and writes share a revision lock; per-entry revisions and paginated queries are a separate next step for sustained parallel agent editing. This version has a shared administrator login, moderated standalone posts, and no MCP endpoint, public accounts, replies, notifications, or automated Facebook crawler. Public submissions are limited to five per client address per hour. Login attempts are limited to ten per client address per fifteen minutes; all credentials and rate-limit identifiers stay server-side. Hosting platform usage charges depend on the user's Vercel/Neon plans and traffic.

If a local development process crashes during a write, an old `.data/write.lock` can remain. Stop local server processes and confirm none is writing before removing that single lock file. Do not delete the catalog to clear a lock.

## Checks

```sh
npm test
npm run typecheck
npm run build
# Start the local server separately before this integration check:
node --env-file=.env.local --import tsx scripts/smoke.ts
```

The smoke check targets localhost only. It checks authentication, origin enforcement, pending moderation, duplicate rejection, stale-write rejection and draft isolation. Its temporary entry is archived afterwards.

`tests/postgres.test.ts` runs when `GAMESLASH_TEST_DATABASE_URL` is set. It creates and removes a randomly named test schema without querying production tables, and checks migration equality, refusal to overwrite a nonempty target, concurrent revision conflicts, rollback, entry ordering, and draft isolation. Use a direct connection URL for this test so the per-connection schema setting is preserved; application traffic uses the pooled URL.

## Sources and media

Game/source links are included on each detail page. Images are original promotional assets from the respective official websites, referenced here for attribution; logos and game imagery belong to their owners. Entries without supplied artwork use a simple typographic UI cover, not a claimed screenshot. Content and image provenance should be checked before adding third-party submissions.

- Suck Up!: https://www.playsuckup.com/ — official `Illustration.webp` scene from the site's Webflow CDN.
- AI Dungeon: https://aidungeon.com/ — official site icon from Latitude's CDN.
- Narrator: https://playnarrator.com/ — official `image_assets/narratorBanner2.png`.
- Agent Breaker: https://play.lakera.ai/agent-breaker — official `meta-image.jpeg`.
- Infinite Craft: https://neal.fun/infinite-craft/
- AI Town: https://www.convex.dev/ai-town and https://github.com/a16z-infra/ai-town

Implementation references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Vercel Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [conditional writes](https://vercel.com/docs/vercel-blob#conditional-writes).
