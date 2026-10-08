import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { collectionSchema, entrySchema, jsonLd, pageMetadata, siteOrigin, sitemapEntries } from "../src/lib/seo";

test("canonical origin accepts future domains and rejects misleading URL configuration", () => {
  assert.equal(siteOrigin("https://gameslash.example/"), "https://gameslash.example");
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?x=1", "https://example.com/#x"]) assert.throws(() => siteOrigin(value));
  const metadata = pageMetadata("/games", "AI Games", "รวมเกม AI");
  assert.equal(metadata.alternates?.canonical, `${siteOrigin()}/games`);
});
test("sitemap and collection schema include published entries only", () => {
  const db = seedDatabase();
  db.entries[0].status = "draft";
  db.entries[1].status = "pending";
  const urls = sitemapEntries(db.entries).map(e => e.url);
  assert.ok(!urls.some(url => url.includes(`/item/${db.entries[0].id}`) || url.includes(`/item/${db.entries[1].id}`)));
  assert.ok(!urls.some(url => /\/admin|\/submit|\/oauth/.test(url)));
  assert.equal(collectionSchema("/games", "AI Games", db.entries).mainEntity.itemListElement.length, db.entries.filter(e => e.status === "published").length);
  assert.throws(() => entrySchema(db.entries[0]), /published/);
});
test("structured data uses actual entry types without converting editorial scores into reviews", () => {
  const entry = seedDatabase().entries.find(e => e.kind === "game")!;
  const schema = entrySchema(entry);
  assert.equal(schema["@graph"][2]["@type"], "VideoGame");
  assert.equal(schema["@graph"][1]["@type"], "BreadcrumbList");
  assert.ok(!jsonLd(schema).includes("aggregateRating"));
  for (const [kind, type] of [["tool", "SoftwareApplication"], ["article", "Article"], ["post", "DiscussionForumPosting"]] as const) {
    assert.equal(entrySchema({ ...entry, kind })["@graph"][2]["@type"], type);
  }
});
test("JSON-LD safely round-trips untrusted content without closing its script", () => {
  const data = { name: '</script><script>alert("x")</script>', description: "เกม AI" };
  const serialized = jsonLd(data);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), data);
});
