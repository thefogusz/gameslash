import test from "node:test";
import assert from "node:assert/strict";
import { discoveryCollections } from "../src/lib/spotlights";
import { seedDatabase } from "../src/lib/seed";

test("curation remains available without inventing trending games", () => {
  const db = seedDatabase();
  const { manual, trending } = discoveryCollections(db.entries, db.layout);
  assert.equal(manual[0].title, "คัดสรร");
  assert.equal(manual[0].badge, "ทีมงานคัดเลือก");
  assert.equal(trending, undefined);
});

test("recommended games keep their category and entries while correcting the community badge", () => {
  const db = seedDatabase();
  db.layout.spotlights = [
    { id: "recommended", title: "เกมแนะนำ", badge: "คัดจากข้อมูลชุมชน", entryIds: ["suck-up"] },
    { id: "custom", title: "ชุดพิเศษ", badge: "ป้ายพิเศษ", entryIds: ["suck-up"] },
  ];
  const { manual } = discoveryCollections(db.entries, db.layout);
  assert.equal(manual[0].title, "เกมแนะนำ");
  assert.equal(manual[0].badge, "ทีมงานคัดเลือก");
  assert.deepEqual(manual[0].entries.map(e => e.id), ["suck-up"]);
  assert.equal(manual[1].badge, "ป้ายพิเศษ");
  assert.equal(db.layout.spotlights[0].badge, "คัดจากข้อมูลชุมชน");
});

test("legacy trending maps to the shared tab; manual player collections cannot masquerade as statistics", () => {
  const db = seedDatabase();
  db.entries.find(e => e.id === "ai-dungeon")!.status = "draft";
  db.layout.spotlights = [
    { id: "old-trending", title: "มาแรง", badge: "มาแรง", entryIds: ["suck-up", "ai-dungeon"] },
    { id: "old-players", title: "ผู้เล่นมากที่สุด", badge: "อันดับ", entryIds: ["suck-up"] },
  ];
  const { manual, trending } = discoveryCollections(db.entries, db.layout);
  assert.deepEqual(manual, []);
  assert.deepEqual(trending?.entries.map(e => e.id), ["suck-up"]);
  db.layout.spotlights[0].title = "ติดเทรนด์";
  assert.equal(discoveryCollections(db.entries, db.layout).trending?.id, "old-trending");
});
