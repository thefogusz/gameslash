# Gameslash editorial agents

Connect using the existing authenticated `/api/mcp` endpoint. Begin with
`get_editorial_skills({})` to discover the skill index and current permissions,
then call `get_editorial_skills({ skillId: "global-news" })` (or another returned
id). Clients supporting MCP resources can read the whole handbook at
`gameslash://editorial/handbook`.

The canonical instructions live in `src/lib/editorial-skills.ts`; the MCP tool,
resource and Console skill panel all use that same source.

| Skill | Purpose |
| --- | --- |
| `global-news` | Multilingual discovery, official announcements and regional communities |
| `source-verification` | Claim-level evidence, dates, attribution and uncertainty |
| `game-analysis` | Gameplay loop, audience, genres, platforms and release stage |
| `audience-signals` | Comparable player statistics versus interest proxies |
| `image-research` | Additional images, permissions, captions and credits |
| `thai-editorial` | Clear, specific Thai writing without invented experience |
| `draft-workflow` | Deduplication, provenance, version checks and review |

These are playbooks for the connected agent. This server does not provide live
web search, translation, image generation or gameplay automation. Agents need
their own tools for those operations. Collection tools read existing jobs;
they do not initiate paid scraping. Permissions remain enforced by the existing
server rules.

Release stages use the shared tag registry and remain separate from the entry's
editorial `status` (`draft`, `pending`, `published`, `archived`). Fetch
`get_game_tags` and use canonical tag names. Do not infer release stage from old
copy or auto-retag existing records. Preserve the official source, region, test
window and checked date in the game body. Missing stage means unconfirmed.

Local validation: `npm run typecheck`, `npm test`, and `scripts/smoke-mcp.ts`
against an isolated local catalog. Never run the mutation smoke test against
production without explicit authorization.
