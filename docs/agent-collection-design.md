# Agent submission workflow

Gameslash Console no longer integrates with Apify. Collection buttons, /api/collections and collection_draft have been removed. APIFY_TOKEN is no longer used. MCP list_collections and get_collection_posts remain available to draft-writing agents and site managers for reading stored source jobs and posts, with at most 10 posts per page. They do not start external runs or modify stored history.

Connect your client to Gameslash MCP at /api/mcp using OAuth or an agent key from Console. Research public sources with client tools, preserve creator credit and sourceUrl, search_entries for duplicates, create_draft, then submit_for_review. An administrator reviews the submission in Console before publication.

Legacy source/job/budget schemas preserve existing history and submitted entries across local, D1 and Postgres storage. History remains private and requires draft-writing or site-management permission through MCP. This removal does not cancel runs already started in an external provider account.
