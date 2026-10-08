import test from "node:test";
import assert from "node:assert/strict";
import { filterDirectory } from "../src/lib/directory-filters";
import { seedDatabase } from "../src/lib/seed";

const entries = seedDatabase().entries;
const defaults = { kind: "game" as const, query: "", category: "", tag: "", sort: "curated" };

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
