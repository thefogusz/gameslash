# Agent submission workflow

Gameslash Console no longer integrates with Apify. Collection buttons, /api/collections, collection_draft, list_collections and get_collection_posts have been removed. APIFY_TOKEN is no longer used.

Connect your client to Gameslash MCP at /api/mcp using OAuth or an agent key from Console. Research public sources with client tools, preserve creator credit and sourceUrl, search_entries for duplicates, create_draft, then submit_for_review. An administrator reviews the submission in Console before publication.

Legacy source/job/budget schemas remain solely for storage compatibility: existing history and submitted entries are preserved and remain private. This removal does not cancel runs already started in an external provider account.
