# News publication timestamps

## Lifecycle

`Entry.publishedAt` is optional, server-owned, and persisted inside the existing entry JSON, so no table/schema migration is needed. It is not accepted by `entryInput`.

- Never-published drafts/pending submissions have no value.
- First publication by administration, review approval, or a site-management agent records the server save timestamp.
- Subsequent edits, unpublishing, trash/restore, or republishing preserve the first timestamp even when older clients omit it or a client submits a different value.
- `null` means an entry is known to have been published, but its original timestamp is unknown. This sentinel preserves the unknown value when that entry is later returned to draft and republished.
- Legacy published entries without a value remain unknown. Previous published restore status, a retained publication review, or a retained publication activity event also establish an unknown previous publication, without substituting those records' times.
- No publication time is inferred from general `createdAt` or `updatedAt` fields. Older draft/archived entries without any surviving history cannot prove prior publication; a future explicit publish action supplies the first observed publication timestamp.

`NewsPublicationTime` hides missing, null, malformed, timezone-less, and impossible dates. Known dates render as semantic `<time dateTime>` using `th-TH` (Buddhist year), fixed `Asia/Bangkok`, and 24-hour time with visible `(เวลาไทย)`. The public UI should include it on article cards and article detail only. Styling belongs to the consuming layout.

## Immediate read-only historical display

`newsPublicationAt` resolves an explicit valid `publishedAt` first. For the ten reviewed receipts only, it otherwise returns the receipt timestamp when ID, article kind, original `createdAt`, and `sourceUrl` all match. The bundled `src/lib/news-publication-receipts.json` preserves the evidence name, SHA-256, and provenance. Missing/null legacy dates can therefore display known historical evidence without database writes. Other legacy entries remain undated. Image/text edits do not change any identity guard or the displayed original publication time. This is not a generic creation/update timestamp fallback.

## Optional limited database backfill (not executed or required for rollout)

The companion `news-publication-backfill-plan.json` contains exactly ten candidate IDs and original timestamps from the supplied direct-publication receipts in `homepage_news_publication_results.json`. It records the SHA-256 of that evidence file. The receipts show each entry initially returned as published and creation/update times equal; the supplied publication workflow identifies these as direct creates. Timestamp equality alone is not grounds to backfill any other entry.

Optional future maintenance only, after separate review/authorization and a supported execution path. No credentials or new mutation API are required by the current read-only UI. Proposed execution:

1. Deploy the compatible optional field and lifecycle first, so the schema retains values. Confirm active storage and read a fresh catalog snapshot/revision. Save a recoverable pre-change snapshot.
2. Restrict the operation to the ten exact manifest IDs. Verify each live entry's ID, kind, source URL and original creation timestamp against its receipt. Require it still to be published. A changed `updatedAt` is expected after content/image edits and is not a source for publication time.
3. Within one revision-checked `updateDatabase` transaction, fill only missing/null `publishedAt`. If it already equals the planned value, skip idempotently. If it is different, stop for review rather than overwrite it. If an identity/evidence/status guard fails, abort the whole operation.
4. Do not use routine `saveSiteEntry`/`manageCatalog`: those deliberately ignore client-supplied publication timestamps. Use a purpose-built reviewed maintenance change assigning only this one field and a bounded audit event. Preserve content, title, source, images, layout, status, ordering, `createdAt`, and `updatedAt`; increment the catalog revision through its normal transaction.
5. Read back and validate all ten values and the no-change fields. Check the homepage, journal, and article detail show 9 October 2569 around 07:22–07:25 Thailand time. The publication timestamp is when Gameslash published the story, not the external event/source date in its title or body.
6. On conflict, re-read and review before retrying. To undo, use a revision-checked operation restoring only each affected `publishedAt` to the saved original value; never restore an entire outdated catalog over later edits.

No catalog writes, database migration, or backfill execution are part of this implementation.
