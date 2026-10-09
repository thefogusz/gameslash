import test from "node:test";
import assert from "node:assert/strict";
import { toolGroups, toolGroupForCategory } from "../src/lib/tool-groups";
import { filterDirectory } from "../src/lib/directory-filters";
import { seedDatabase } from "../src/lib/seed";

test("audio variants and future categories remain discoverable without changing metadata", () => {
  const base = seedDatabase().entries.find(e => e.kind === "tool")!;
  const entries = ["เสียงและเพลง", "เสียงและดนตรี", "คลังแอสเซ็ตเสียง", "หมวดใหม่", "เอนจินเกม"].map((category, index) => ({ ...base, id: `sample-${index}`, category, title: `Sound ${index}` }));
  const before = JSON.stringify(entries);
  const audio = entries.filter(e => toolGroupForCategory(e.category).id === "audio");
  const filters = { kind: "tool" as const, query: "sound", category: "", tag: "", sort: "curated" };
  assert.deepEqual(filterDirectory(audio, filters).map(e => e.id), ["sample-0", "sample-1", "sample-2"]);
  assert.deepEqual(filterDirectory(audio, { ...filters, category: "เสียงและดนตรี" }).map(e => e.id), ["sample-1"]);
  assert.equal(toolGroupForCategory("หมวดใหม่").id, "other");
  assert.equal(JSON.stringify(entries), before);
});

test("each category has one workflow and existing tool deep links keep their precise category", () => {
  const categories = toolGroups.flatMap(group => group.categories);
  assert.equal(new Set(categories).size, categories.length);
  assert.equal(toolGroupForCategory("พิกเซลอาร์ต").id, "art");
  assert.equal(toolGroupForCategory("ระบบออนไลน์และแบ็กเอนด์").id, "code");
  assert.equal(toolGroupForCategory("เลเวลและแผนที่").id, "build");
  assert.equal(toolGroupForCategory("เผยแพร่เกมและแพลตฟอร์ม").id, "release");
});
