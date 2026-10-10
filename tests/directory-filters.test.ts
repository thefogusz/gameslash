import test from "node:test";
import assert from "node:assert/strict";
import { filterDirectory, gameMakingTools, rankedGameCategories, toolWorkflowCategories, visibleGameCategories } from "../src/lib/directory-filters";
import { seedDatabase } from "../src/lib/seed";

const entries = seedDatabase().entries;
const defaults = { kind: "game" as const, query: "", category: "", tag: "", sort: "curated" };

test("news always sorts by latest publication, falling back to creation, with stable ties", () => {
  const base = entries.find(e => e.kind === "article")!;
  const sample = [
    { ...base, id: "older", title: "A", createdAt: "2026-10-10T00:00:00Z", publishedAt: "2026-10-07T00:00:00Z" },
    { ...base, id: "newer", title: "Z", createdAt: "2026-10-01T00:00:00Z", publishedAt: "2026-10-09T07:00:00+07:00" },
    { ...base, id: "tie", createdAt: "2026-10-01T00:00:00Z", publishedAt: "2026-10-09T00:00:00Z" },
    { ...base, id: "legacy", createdAt: "2026-10-08T00:00:00Z", publishedAt: null },
  ];
  for (const sort of ["curated", "new", "az", "oldest"]) {
    assert.deepEqual(filterDirectory(sample, { ...defaults, kind: "article", sort }).map(e => e.id), ["newer", "tie", "legacy", "older"]);
  }
  assert.deepEqual(sample.map(e => e.id), ["older", "newer", "tie", "legacy"]);
});

test("sidebar ranks game counts, preserves ties and color indices, and keeps empty genres last", () => {
  const categories = [...seedDatabase().layout.categories, "แอ็กชัน"];
  const sample = [
    ...[5, 4, 5].map(index => ({ ...entries[0], kind: "game" as const, category: categories[index] })),
    { ...entries[0], kind: "tool" as const, category: categories[0] },
  ];
  const before = JSON.stringify({ categories, sample });
  assert.deepEqual(rankedGameCategories(categories, sample), [5, 4, 0, 1, 2, 3, 6, 7].map(index => ({
    category: categories[index], index, count: index === 5 ? 2 : index === 4 ? 1 : 0,
  })));
  assert.deepEqual(rankedGameCategories(categories, []), categories.map((category, index) => ({ category, index, count: 0 })));
  assert.equal(JSON.stringify({ categories, sample }), before);
});

test("tool workflow excludes publishing and ignores retired tag filters in old links", () => {
  const before = JSON.stringify(entries);
  assert.deepEqual(gameMakingTools(entries).map(e => e.id), ["claude", "godot", "blender"]);
  const tools = { ...defaults, kind: "tool" as const, tag: "missing-tag" };
  assert.equal(filterDirectory(entries, { ...tools, category: "เผยแพร่" }).length, 3);
  assert.deepEqual(filterDirectory(entries, { ...tools, category: "เอนจินเกม" }).map(e => e.id), ["godot"]);
  assert.equal(filterDirectory(entries, { ...tools, category: "ทดสอบเกม" }).length, 0);
  assert.equal(toolWorkflowCategories[0], "ไอเดียและออกแบบ");
  assert.equal(toolWorkflowCategories.at(-1), "ทดสอบเกม");
  assert.equal(JSON.stringify(entries), before);
});
test("GitHub tools appear in their new 2D workflow category", () => {
  const sprite = { ...entries.find(e => e.id === "godot")!, id: "agent-sprite-forge", title: "Agent Sprite Forge", category: "สไปรต์และภาพ 2D", url: "https://github.com/0x0funky/agent-sprite-forge" };
  assert.ok(toolWorkflowCategories.includes("สไปรต์และภาพ 2D"));
  assert.ok(toolWorkflowCategories.includes("บทสนทนาและเนื้อเรื่อง"));
  assert.deepEqual(filterDirectory([...entries, sprite], { ...defaults, kind: "tool", category: sprite.category, query: "sprite" }).map(e => e.id), [sprite.id]);
});

test("directory combines category, tag and trimmed search without mutating its source", () => {
  const original = JSON.stringify(entries);
  const matches = filterDirectory(entries, { ...defaults, category: "ปริศนา", tag: "เว็บ", query: "  INFINITE  " });
  assert.deepEqual(matches.map(e => e.id), ["infinite-craft"]);
  assert.equal(filterDirectory(entries, { ...defaults, category: "RPG", tag: "PC" }).length, 0);
  assert.equal(filterDirectory(entries, { ...defaults, query: "   " }).length, entries.filter(e => e.kind === "game").length);
  assert.equal(filterDirectory(entries, { ...defaults, kind: "tool", query: "Godot" })[0].kind, "tool");
  assert.equal(JSON.stringify(entries), original);
});

test("directory sorts dates and featured games independently of source order", () => {
  const base = entries[0];
  const sample = [
    { ...base, id: "a", title: "Alpha", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z" },
    { ...base, id: "b", title: "Bravo", createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z" },
  ];
  for (const [sort, expected] of [["new", "b"], ["oldest", "a"], ["updated", "a"], ["az", "a"], ["curated", "b"]]) {
    assert.equal(filterDirectory(sample, { ...defaults, sort }, ["b"])[0].id, expected);
  }
});


test("platform discovery uses explicit tags only and composes with existing filters", () => {
  const sample = [
    { ...entries[0], id: "web-only", tags: ["เว็บ", "RPG"], category: "RPG" },
    { ...entries[0], id: "android", tags: ["Android"], category: "ปริศนา" },
    { ...entries[0], id: "ios-web", tags: ["iOS", "เว็บ"], category: "RPG" },
    { ...entries[0], id: "desktop", tags: ["PC", "macOS", "Linux"] },
    { ...entries[0], id: "unknown", tags: [], url: "https://example.com/play" },
  ];
  const before = JSON.stringify(sample);
  const ids = (platform: string) => filterDirectory(sample, { ...defaults, platform }).map(e => e.id);
  assert.deepEqual(ids("web"), ["web-only", "ios-web"]);
  assert.deepEqual(ids("mobile"), ["android", "ios-web"]);
  assert.deepEqual(ids("pc"), ["desktop"]);
  assert.equal(ids("").length, 5); assert.equal(ids("invalid").length, 5);
  assert.deepEqual(filterDirectory(sample, { ...defaults, platform: "mobile", category: "RPG", tag: "เว็บ" }).map(e => e.id), ["ios-web"]);
  assert.equal(JSON.stringify(sample), before);
  assert.equal(filterDirectory([{ ...sample[0], kind: "article" }], { ...defaults, kind: "article", platform: "pc" }).length, 1);
});
test("public game genres omit empty/news-only categories without modifying taxonomy", () => {
  const categories = ["RPG", "การศึกษา", "ข่าวเกม AI", "ปาร์ตี้"];
  const sample = [ { ...entries[0], category: "การศึกษา" }, { ...entries[0], kind: "article" as const, category: "ข่าวเกม AI" } ];
  assert.deepEqual(visibleGameCategories(categories, sample), ["การศึกษา"]);
  assert.deepEqual(visibleGameCategories(categories, sample, "RPG"), ["RPG", "การศึกษา"]);
  assert.equal(categories.length, 4);
});

test("secondary sidebar genres preserve platform, query, tag, sort and likes", async () => {
  const { gameGenreHref } = await import("../src/lib/directory-filters");
  const href = gameGenreHref("RPG", "platform=mobile&q=cat&tag=iOS&sort=new&liked=1&category=Puzzle");
  const params = new URL(href, "https://gameslash.vercel.app").searchParams;
  assert.deepEqual(Object.fromEntries(params), { platform: "mobile", q: "cat", tag: "iOS", sort: "new", liked: "1", category: "RPG" });
  assert.equal(params.getAll("category").length, 1);
  assert.equal(gameGenreHref("RPG"), "/games?category=RPG");
  assert.equal(gameGenreHref("", "platform=web&category=RPG"), "/games?platform=web");
  const sample = [
    { ...entries[0], id: "mobile-rpg", title: "Cat RPG", category: "RPG", tags: ["iOS"] },
    { ...entries[0], id: "web-rpg", title: "Cat RPG", category: "RPG", tags: ["เว็บ"] },
  ];
  assert.deepEqual(filterDirectory(sample, { ...defaults, platform: params.get("platform")!, category: params.get("category")!, query: params.get("q")!, tag: params.get("tag")!, sort: params.get("sort")! }).map(e => e.id), ["mobile-rpg"]);
});

test("explicit mobile-browser support matches Web and Mobile without inventing OS or PC", async () => {
  const { gamePlatformBadges } = await import("../src/lib/game-platforms");
  const game = { ...entries[0], tags: ["เว็บบนมือถือ"] };
  for (const platform of ["web", "mobile"]) assert.equal(filterDirectory([game], { ...defaults, platform }).length, 1);
  assert.equal(filterDirectory([game], { ...defaults, platform: "pc" }).length, 0);
  assert.deepEqual(gamePlatformBadges(game.tags).map(g => g.value), ["web", "mobile"]);
  assert.deepEqual(game.tags, ["เว็บบนมือถือ"]);
});


test("tool stars sort descending with unrated last, stable ties, category filtering and no mutation", () => {
  const base = { ...entries.find(e => e.kind === "tool")!, category: "เขียนโค้ด" };
  const popularity = (score: number) => ({ score, reason: "Evidence from documented adoption", sources: ["https://example.com"], checkedAt: "2026-10-10" });
  const sample = [
    { ...base, id: "unrated", popularity: null },
    { ...base, id: "three", popularity: popularity(3) },
    { ...base, id: "five-a", popularity: popularity(5) },
    { ...base, id: "missing", popularity: undefined },
    { ...base, id: "five-b", popularity: popularity(5) },
    { ...base, id: "one", popularity: popularity(1) },
    { ...base, id: "other", category: "เสียงและเพลง", popularity: popularity(5) },
  ];
  const before = JSON.stringify(sample);
  assert.deepEqual(filterDirectory(sample, { ...defaults, kind: "tool", category: base.category, sort: "popularity" }).map(e => e.id), ["five-a", "five-b", "three", "one", "unrated", "missing"]);
  assert.deepEqual(filterDirectory(sample, { ...defaults, kind: "tool" }).map(e => e.id), sample.map(e => e.id));
  assert.equal(JSON.stringify(sample), before);
});
