# Likes and local recommendations

Likes now persist in the central catalog, associated with an anonymous HttpOnly
browser cookie. The console displays totals and can sort by most hearts. See
[storage and deployment notes](game-likes.md), including the required D1 worker update.

`gameslash:likes:v1` in localStorage remains a cache:
`{ "version": 1, "likedIds": ["game-id"], "synced": true }`.
Old values without `synced` import once on the browser's next visit. The provider
loads after hydration and synchronizes same-origin tabs. Hearts change only after
the server confirms a write; failures display an error and preserve prior likes.
Cookies suffice when local storage is blocked. Browsers and devices do not share likes.

Recommendations exclude liked and unpublished games. A shared genre adds 3 points and each shared tag adds 1; generic AI labels do not affect the score. Editorial selection breaks ties, and unmatched games fill remaining positions when the catalog is small. Removing a like recomputes the list. The homepage defaults to recommendations after a visitor has liked games, while an explicitly selected tab remains selected. All-liked and no-likes states are handled explicitly.

Homepage spotlight tabs use editorial collections, automatically added newest games, recommendations and saved likes. Genre-named collections are suppressed; genres remain in browsing filters. Trending/popular collections only appear when an editor has configured games, with a visible editorial-selection explanation. They are not aggregate rankings. Console can select these collection titles using existing layout data; no schema or MCP payload migration is required.

The saved-games page is `/games?liked=1`; its contents depend on the current browser and are not encoded in the URL. Search, category and tag filters can be combined with that view.

Checks: local-storage parser and recommendation tests, genre-tab exclusion, browser like/unlike persistence, card/detail synchronization, empty states, responsive layout, and build/type checking.
