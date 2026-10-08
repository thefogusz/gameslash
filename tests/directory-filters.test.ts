import test from "node:test";
import assert from "node:assert/strict";
import { filterDirectory, gameMakingTools, rankedGameCategories, toolWorkflowCategories } from "../src/lib/directory-filters";
import { seedDatabase } from "../src/lib/seed";

const entries = seedDatabase().entries;
const defaults = { kind: "game" as const, query: "", category: "", tag: "", sort: "curated" };

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
