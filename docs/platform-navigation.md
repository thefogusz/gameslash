# Platform discovery and rollout

## UI
- Primary groups above the home selection and game results: ทั้งหมด, เล่นบนเว็บ, มือถือ, PC.
- Genre stays a secondary filter. The sidebar uses an expandable genre list with only populated game categories; stored taxonomy and home sections are unchanged.
- Full tags stay available through the expandable tag filter and game detail pages. Compact cards show at most three grouped platform badges; release status and specific OS remain on details.
- URL parameter `platform=web|mobile|pc` composes with `q`, `category`, `tag`, `liked`, and `sort`. All/reset removes the platform filter. Invalid platform values act as All. Browser Back/Forward uses the existing Next.js native-history integration.

## Classification (no inference)
- web: explicit `เว็บ` or `เว็บบนมือถือ` tag.
- mobile: explicit `Android`, `iOS`, or `เว็บบนมือถือ` tag.
- pc: explicit `PC`, `macOS`, or `Linux` tag.
- A game can match multiple groups. A URL, responsive landing page, touch icon, genre, or current device does not establish support. PC is compatibility, not a promise of a native/downloadable build. Android/iOS tags do not automatically prove an app-store release.
- Unknown entries remain in All. `เว็บบนมือถือ` is the canonical phone-browser label and requires explicit source evidence or actual mobile-browser testing. It maps to Web and Mobile without inventing Android/iOS/native support.

## Storage and API
No migration, changed write contract, new required field, tag rename, or automatic backfill. The new `เว็บบนมือถือ` label is appended to the built-in registry without changing existing IDs. Existing `entry.tags` and approved Console/MCP editing paths remain the source. This change only adds client-side discovery filtering; MCP `search_entries` is unchanged. Future device/browser distinctions should use an explicitly reviewed schema, not URL heuristics.

## Backfill prerequisite
At 2026-10-09 00:32 UTC, 37 published game records were read through `get_entry`; all lacked platform tags. Therefore exact-tag counts were All 37, Web 0, Mobile 0, PC 0. Catalog publication continued concurrently; these are snapshot counts, not fixed production totals.

Before rollout:
1. The publisher should reuse existing verified gameplay/source records and inspect the latest entry before each edit.
2. Add only supported existing platform tags, preserving all other tags and metadata. Keep a source URL and checked date in the entry details/evidence. Respect the 20-tag limit; never remove unrelated tags to make room without review.
3. `เว็บ` requires an actual browser-playable release or explicit creator evidence. iOS/Android require explicit platform evidence. PC/macOS/Linux require explicit computer-platform evidence. Unknown remains unknown.
4. Use optimistic-concurrency timestamps/revisions, re-read on conflict, and verify the saved entry. Do not mass-write stale whole records or alter homepage layout.
5. Recompute live counts and review one known web, mobile, PC, multi-platform and unknown case. Backfill is a separately authorized catalog action; this PR contains no production data writes.

## Verification
Unit coverage checks platform overlap, unknowns, invalid query values, combined filters, non-game behavior, metadata preservation and excluding empty/news-only public game genres. Visual QA must also cover narrow/mobile layout, dropdown/disclosure behavior, reset, search and Back/Forward.

## Review fixture and verification
The separately reviewed 39-game platform proposal was used only in an isolated local fixture: All 39, Web 25, Mobile 5, PC 10. These overlapping groups leave six games unknown; counts are not a claim that production backfill has run. Built-app SSR returned exactly those result/card counts for each URL filter. Existing publication receipts were likewise used for ten article records; all ten journal cards and the sampled detail emitted receipt-backed semantic publication times. Responsive CSS is included, but desktop/mobile interaction and pixel verification through CUA are still pending a reachable preview. Unit/type checks and the production webpack build passed; the build used a temporary experimental.cpus=2 resource cap that is not committed.

## Incremental review fixes
Sidebar genre links preserve the existing game-directory query parameters, including platform, search, tags, sorting and likes. From another view they open a fresh game category. The separately prepared 11 mobile-browser candidates must not be written until deployment exposes the new canonical tag through `get_game_tags`; source-reviewed support is distinct from a claim of playtesting.
