# Likes and local recommendations

Likes use `gameslash:likes:v1` in localStorage: `{ "version": 1, "likedIds": ["game-id"] }`.
Only game IDs are stored. No account, tracking request, aggregate like counter or server write is involved.
The provider loads after hydration, synchronizes same-origin tabs, validates stored IDs and reports unavailable storage. Failed writes keep preferences in memory for the current page session.
Clearing site data removes likes; browsers and devices do not share them.

Recommendations exclude liked and unpublished games. A shared genre adds 3 points and each shared tag adds 1; generic AI labels do not affect the score. Editorial selection breaks ties, and unmatched games fill remaining positions when the catalog is small. Removing a like recomputes the list. The homepage defaults to recommendations after a visitor has liked games, while an explicitly selected tab remains selected. All-liked and no-likes states are handled explicitly.

Homepage spotlight tabs use editorial collections, automatically added newest games, recommendations and saved likes. Genre-named collections are suppressed; genres remain in browsing filters. Trending/popular collections only appear when an editor has configured games, with a visible editorial-selection explanation. They are not aggregate rankings. Console can select these collection titles using existing layout data; no schema or MCP payload migration is required.

The saved-games page is `/games?liked=1`; its contents depend on the current browser and are not encoded in the URL. Search, category and tag filters can be combined with that view.

Checks: local-storage parser and recommendation tests, genre-tab exclusion, browser like/unlike persistence, card/detail synchronization, empty states, responsive layout, and build/type checking.
