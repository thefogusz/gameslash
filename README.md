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

`POST /api/manage` is authenticated and requires the current revision plus a matching Origin. The browser interface is the administrator surface; agents use scoped MCP keys, never the administrator password.

## Connect Dots or another MCP client

See [agent collection design](docs/agent-collection-design.md) for the public Facebook/Apify workflow, official sources, setup instructions, and the distinction between implemented review features and future managed collection jobs.

Open `/admin` → **เอเจนต์**, name the agent and create a key. The raw key appears once, expires after 90 days, and can be revoked from this page. Only a SHA-256 hash is stored. Keep the key in the client's secret configuration, never in a prompt or source control.

- Endpoint: `https://gameslash.vercel.app/api/mcp`
- Transport: Streamable HTTP (stateless); header `Authorization: Bearer YOUR_AGENT_TOKEN`
- Requires a client that accepts a custom Bearer token. OAuth discovery/login and legacy SSE transport are not implemented; Dots compatibility must be checked with the actual client.
- Keys can read published entries and their own submissions. Optional write permission only allows creating/editing their own drafts and sending them for human review. It cannot publish, edit another agent's work, change layout, or issue keys.

Tools: `get_categories`, `search_entries` (query, optional kind, offset, limit up to 25), `get_entry` (id), `create_draft` (requestId, entry), `update_draft` (id, expectedUpdatedAt, entry), and `submit_for_review` (id, expectedUpdatedAt).

Entry fields follow the JSON import format. Search for existing URLs first and retain source URLs and creator credits. `create_draft` optionally accepts `context: {provider, runId?, reason}` for private, agent-reported collection provenance. Reuse the same `requestId` (8–100 characters) only to retry the same entry and context. Updates replace content fields; use the latest `updatedAt` as `expectedUpdatedAt`. Stale edits return `CONFLICT`. After submission the entry is pending and the agent cannot edit it. The administrator reviews it in **กล่องรอตรวจ** and can publish, return with feedback, or reject into the archive. Returned entries become editable drafts. `search_entries` supports `ownedOnly` and `status`; `get_entry` returns private `review` feedback only to the submitting agent, otherwise `null`.

Agent writes are limited to 60/hour/key. Catalog storage currently allows 50 issued keys (including revoked keys), and retains only the latest 200 management activity records, not a full audit archive. There is no automatic crawler: agents supply metadata and outbound links. MCP responses contain untrusted source content, never instructions for the client to obey. Older deployments that do not preserve agent metadata must not be used as rollback targets after keys are issued.

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

This is a small editorial CMS, capped at 3,000 entries. Reads still load the whole catalog, and writes share a revision lock; paginated database queries are a separate next step for sustained parallel agent editing. This version has a shared administrator login, moderated standalone posts, and scoped MCP access. Public accounts, replies, notifications, and an automated Facebook crawler are not implemented. Public submissions are limited to five per client address per hour. Login attempts are limited to ten per client address per fifteen minutes; all credentials and rate-limit identifiers stay server-side. Hosting platform usage charges depend on the user's Vercel/Neon plans and traffic.

If a local development process crashes during a write, an old `.data/write.lock` can remain. Stop local server processes and confirm none is writing before removing that single lock file. Do not delete the catalog to clear a lock.

## Checks

```sh
npm test
npm run typecheck
npm run build
# Start the local server separately before this integration check:
node --env-file=.env.local --import tsx scripts/smoke.ts
node --env-file=.env.local --import tsx scripts/smoke-mcp.ts
```

The smoke check targets localhost only. It checks authentication, origin enforcement, pending moderation, duplicate rejection, stale-write rejection and draft isolation. Its temporary entry is archived afterwards.

The MCP smoke check exercises initialization and tools through HTTP, hashed key responses, draft ownership, read-only permissions, retries, stale updates, review submission and revocation. Test keys are revoked and test entries archived afterwards. PostgreSQL integration also checks agent metadata persistence in its isolated schema.

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

### Tool popularity assessments

Tool entries may include `popularity: { score, reason, sources, checkedAt }`.
Scores are editorial popularity tiers (integer 1–5), not user reviews or quality ratings. Research adoption, released work/ecosystem and recognition; 5 requires strong evidence across all three. Missing evidence must remain unrated, not be translated into low popularity. `sources` requires 1–5 distinct public HTTPS URLs; `checkedAt` is YYYY-MM-DD.

The public tool card exposes rationale and sources. Console editors and MCP draft tools share the schema; agent drafts still require human publication. Existing clients may omit this optional field without erasing an existing assessment; explicitly send `null` to clear it. Changing an entry to a non-tool kind removes its tool-only rating. No external analytics or automatic user counts are implied.
