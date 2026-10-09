import test from "node:test";
import assert from "node:assert/strict";
import { seedDatabase } from "../src/lib/seed";
import { collectionSchema, entrySchema, jsonLd, pageMetadata, seoDescription, seoKeywords, sectionSeo, siteOrigin, sitemapEntries } from "../src/lib/seo";

test("site discovery metadata describes games made with AI rather than runtime AI", () => {
  assert.match(seoDescription, /เกมที่สร้างด้วย AI/);
  assert.match(sectionSeo.games.title, /Games Made with AI/);
  const metadata = [pageMetadata("/", "GameSlash", seoDescription), ...Object.entries(sectionSeo).map(([section, seo]) => pageMetadata(`/${section}`, seo.title, seo.description))];
  assert.doesNotMatch(JSON.stringify({ metadata, seoKeywords }), /NPC|intelligent|AI-powered|เกมที่มี AI|generative AI experiences/i);
  assert.equal(entrySchema(seedDatabase().entries[0])["@graph"][1].itemListElement?.[1].name, "เกมที่สร้างด้วย AI");
});

test("canonical origin accepts future domains and rejects misleading URL configuration", () => {
  assert.equal(siteOrigin("https://gameslash.example/"), "https://gameslash.example");
  for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?x=1", "https://example.com/#x"]) assert.throws(() => siteOrigin(value));
  const metadata = pageMetadata("/games", "AI Games", "รวมเกม AI");
  assert.equal(metadata.alternates?.canonical, `${siteOrigin()}/games`);
});
test("social metadata uses the selected cover and preserves entry-specific images", () => {
  const originalOrigin = process.env.GAMESLASH_SITE_URL;
  delete process.env.GAMESLASH_SITE_URL;
  try {
    assert.equal(siteOrigin(), "https://gameslash.app");
    const metadata = pageMetadata("/", "GameSlash", seoDescription);
    assert.equal(metadata.alternates?.canonical, "https://gameslash.app/");
    for (const social of [metadata.openGraph, metadata.twitter]) {
      assert.match(JSON.stringify(social?.images), /https:\/\/gameslash\.app\/images\/gameslash-social-v4\.png/);
    }
    const entry = pageMetadata("/item/game", "Game", "Description", "https://creator.example/cover.png");
    for (const social of [entry.openGraph, entry.twitter]) {
      assert.match(JSON.stringify(social?.images), /https:\/\/creator\.example\/cover\.png/);
    }
  } finally {
    if (originalOrigin === undefined) delete process.env.GAMESLASH_SITE_URL;
    else process.env.GAMESLASH_SITE_URL = originalOrigin;
  }
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
