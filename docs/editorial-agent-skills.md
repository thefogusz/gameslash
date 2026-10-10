# Gameslash editorial agents

Gameslash accepts games whose creators used AI to develop them. A creator's
statement or an attributed source establishing AI-assisted development is enough
to prepare an entry. Neither a named AI tool nor AI inside gameplay is required.
Use `สร้างด้วย AI` for development. AI-powered gameplay or NPCs alone do not
qualify a game for the catalog. Do not append disclaimers about missing tool names or unconfirmed
in-game AI when those details were never claimed. Omit unspecified details and
focus on the game. This policy is returned with every skill tool response and at
the beginning of the resource handbook.

Connect using the existing authenticated `/api/mcp` endpoint. Begin with
`get_editorial_skills({})` to discover the skill index and current permissions,
then call `get_editorial_skills({ skillId: "global-news" })` (or another returned
id). Clients supporting MCP resources can read the whole handbook at
`gameslash://editorial/handbook`.

The canonical instructions live in `src/lib/editorial-skills.ts`; the MCP tool,
resource and Console skill panel all use that same source. `get_article_format`
also returns the canonical image, Thai-writing, SEO/AI-search and draft-workflow guides so
illustrated-entry clients receive the same rules without maintaining copies.

| Skill | Purpose |
| --- | --- |
| `global-news` | Multilingual discovery, official announcements and regional communities |
| `source-verification` | Claim-level evidence, dates, attribution and uncertainty |
| `game-analysis` | Gameplay loop, audience, genres, platforms and release stage |
| `audience-signals` | Comparable player statistics versus interest proxies |
| `image-research` | Additional images, permissions, captions and credits |
| `thai-editorial` | Clear, specific Thai writing without invented experience |
| `seo-ai-search` | Search intent, evidence-led articles, titles/descriptions, stable URLs, image naming/alt and SEO preflight |
| `draft-workflow` | Deduplication, provenance, version checks and review |

These are playbooks for the connected agent. This server does not provide live
web search, translation, image generation or gameplay automation. Agents need
their own tools for those operations. Collection tools read existing jobs;
they do not initiate paid scraping. Permissions remain enforced by the existing
server rules.

## SEO and AI-search preflight

Read `get_editorial_skills({ skillId: "seo-ai-search" })`, then call
`audit_entry_seo({ entry: <exact proposed EntryInput> })` before saving.
This read-only tool uses the same input validation as drafts, accepts read-only
agents, and does not load the catalog or fetch URLs. It reports observable
content issues and manual checks, not a ranking score, indexing confirmation,
fact/rights verification or a `record_entry_qa` receipt. It does not add a
publication gate or change human Console/news permissions.

The guide covers intent, sourced Thai articles, titles/descriptions, internal
links and image naming/alt. Respect the current storage contracts:

- `create_draft` generates an `agent-<hash>` id for retry safety. It does not
  accept a custom slug. Managers may choose a descriptive ASCII slug for a new
  `save_site_entry`, after checking collisions. Keep existing ids/URLs stable.
- `upload_image` returns `/api/media/<sha256>.webp` for deduplication. Use that
  exact URL; descriptive original filenames do not rename uploaded assets.
- Article titles already provide H1 and metadata. Use H2/H3 in rich content.
  The first article image supplies the cover; audit it rather than an unused
  legacy cover. Current article JSON does not support tables or raw JSON-LD.

Validate current platform advice against the official sources linked in the
guide. `llms.txt` is not a Google visibility requirement. Search and training
crawler policies are independent. Measure changes with available Search Console
reports and comparable AI-answer samples; a clean preflight does not prove impact.

Release stages use the shared tag registry and remain separate from the entry's
editorial `status` (`draft`, `pending`, `published`, `archived`). Fetch
`get_game_tags` and use canonical tag names. Do not infer release stage from old
copy or auto-retag existing records. Preserve the official source, region, test
window and checked date in the game body. Missing stage means unconfirmed.

Local validation: `npm run typecheck`, `npm test`, and `scripts/smoke-mcp.ts`
against an isolated local catalog. Never run the mutation smoke test against
production without explicit authorization.


## Collection-to-review workflow

Use the shared playbooks together, not a second independent policy:

- `global-news` follows every collection page, public comments and shared-post
  links, preserving original post URLs. Deduplicate by canonical game URL and
  project identity, not title alone.
- `source-verification` separates creator, compilation sharer and image owner.
  Link only verified creator profiles with compact names, and use
  `โพสต์ต้นทาง` for posts or `แหล่งข้อมูลต้นทาง` for official tool sources.
- `game-analysis` tries accessible guest gameplay with nickname `GameSlash`.
  Firsthand claims require actual play; source review is not a playtest.
- `image-research` gathers 3–5 candidates and selects 2–3 distinct gameplay
  scenes when available. Prefer original full-resolution files; inspect every
  image and caption, exclude page/browser furniture, and preserve actual HUD
  and attribution. Never fabricate gameplay to fill missing evidence.
- `thai-editorial` supports illustrated game reviews in `entry.content`, just
  like articles. Use meaningful paragraphs and feature-adjacent images, not
  empty spacer paragraphs or public QA logs. `body` alone does not replace
  existing rich content.
- `draft-workflow` tracks found, verified, played, image-ready, published and
  blocked separately. These are private work-tracking labels, not new server
  statuses. Read back uncertain writes before retrying, isolate blocked items,
  and reconcile all candidates before reporting completion.

Existing statistics, multilingual research, tag registry, provenance, image
rights and revision/ownership rules remain in force. One task's publication
approval never grants standing permission for later tasks. Updating live entries
requires authorization for that immediate public effect; preserve correct
existing material. This handbook does not alter authentication, credentials,
OAuth consent, sharing or client confirmation safeguards.

### Regression scenarios

In addition to automated tests, review changes against these cases:

1. A collection post has no game URL but a public comment/shared post does.
2. Two different projects have the same title, or one project has multiple names.
3. A guest playtest has self-captured images mixed with official/player images.
4. A game requires login: report the access limit without inventing gameplay,
   while continuing independent candidates.
5. A live illustrated entry needs a narrow correction: preserve correct material,
   refresh revision/updatedAt and edit content, not body alone.
6. A publish request times out: reconcile server state before retrying and do not
   turn uncertain writes into duplicate entries or false completion reports.
