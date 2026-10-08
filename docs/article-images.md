# Illustrated articles (Console + MCP)

The Console uses the open-source [Tiptap editor](https://github.com/ueberdosis/tiptap).
Both interfaces store the same validated Tiptap JSON in `entry.content`; the renderer
uses React elements, not raw HTML. `entry.image` is the cover used by directory cards
and the article header. `entry.imageAlt` describes it. Existing `body` text still
renders when `content` is absent; opening an old article converts paragraphs in memory,
and saves JSON only when the administrator saves the form.

## Agent workflow

1. Call `get_article_format` to discover the supported format and limits.
2. Call `upload_image` with raw base64 PNG/JPEG/WebP bytes (no data URL), or use a
   public HTTPS image URL you have permission to publish.
3. Use the returned relative URL in `entry.image` or an image node's `attrs.src`.
4. `create_draft`, then `get_entry` to verify content and images. For edits, preserve
   `content`, `image` and `imageAlt` and send the latest `expectedUpdatedAt`.
   Omitting optional `content` on MCP edits preserves it; changing `body` alone
   does not replace an existing rich article. Send a new document to replace it.
5. `submit_for_review`. The existing human approval, ownership, retry idempotency,
   stale-edit checks and token revocation rules remain in force.

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "ปรับแสงในฉาก" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "ตัวอย่างก่อนและหลังปรับแสง" }] },
    { "type": "image", "attrs": { "src": "https://example.com/scene.webp", "alt": "ฉากหลังปรับแสง", "title": "เครดิตภาพ: ผู้สร้าง" } }
  ]
}
```

Supported blocks: paragraph, heading (2/3), image, bulletList/orderedList with
paragraph-only listItems, blockquote with paragraphs, codeBlock and horizontalRule.
Inline nodes: text and hardBreak. Marks: bold, italic, underline, strike, code,
link (public HTTPS). Image `title` is rendered as a caption. Lists have one level.
No executable HTML, SVG, data URLs or arbitrary editor extensions are accepted.
Maximum: 200 blocks and 100,000 serialized characters per document.

## Storage and upload boundaries

- Console: authenticated, same-origin `POST /api/media`, raw image bytes with
  `Content-Type: image/png`, `image/jpeg` or `image/webp`.
- MCP: `upload_image` requires an active token with draft-writing permission.
- Both use `saveImage`: decode actual pixels, reject unsupported/corrupt/animated
  files, limit input to 2 MiB / 25 megapixels, strip metadata, resize to fit 2000px
  and encode WebP. 40 uploads per actor/hour and 200 across the app/day.
  Upload counters are stored atomically without advancing the editorial revision,
  so uploading a picture does not invalidate the open article form.
- Vercel uses the existing private Blob store (`BLOB_READ_WRITE_TOKEN`). Local
  development without a token writes ignored `.data/media/` files.
- `GET /api/media/<sha256>.webp` serves only that media namespace with a fixed image
  content type. It cannot read the private catalog or arbitrary Blob paths.
- **Images are publicly retrievable by URL even while the article is a draft.**
  Do not upload private material. Article text and approval remain private.
- Identical normalized pixels share a content-addressed URL. Removing an image
  from an article removes the reference; it does not delete a potentially shared
  file. Orphan cleanup is not automatic.

## Verification

`npm test` covers schema boundaries, safe rendering, legacy text and image decoding.
`node --env-file=.env.local --import tsx scripts/smoke-mcp.ts` runs on localhost only:
image upload/readback, read-only denial, JSON roundtrip through create/edit/review,
public rendering, ownership, conflicts and revocation. Never point this at production.

References: [Next.js setup](https://tiptap.dev/docs/editor/getting-started/install/nextjs),
[Image extension](https://tiptap.dev/docs/editor/extensions/nodes/image),
[Vercel private Blob](https://vercel.com/docs/vercel-blob/private-storage).
