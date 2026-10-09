import test from "node:test";
import assert from "node:assert/strict";
import { collectionContextSchema, databaseSchema, publicData, layoutSchema } from "../src/lib/model";
import { seedDatabase } from "../src/lib/seed";
import { managementMutation } from "../src/lib/catalog-service";
import { spotlightGroups } from "../src/lib/spotlights";
test("removed collection mutations are rejected while legacy history stays private and survives parsing", () => {
  const db = seedDatabase();
  db.collectionJobs.push({ id: crypto.randomUUID(), source: { id: crypto.randomUUID(), name: "Old group", url: "https://www.facebook.com/groups/123" }, createdAt: new Date().toISOString(), status: "SUCCEEDED", limit: 10, runId: "abc123", message: "", candidates: [{ url: "https://www.facebook.com/groups/123/posts/456", text: "Saved history", author: "Creator", time: "" }] });
  assert.equal(managementMutation.safeParse({ action: "collection_draft", revision: db.revision, jobId: db.collectionJobs[0].id, sourceUrl: db.collectionJobs[0].candidates[0].url, entry: db.entries[0] }).success, false);
  assert.deepEqual(databaseSchema.parse(db).collectionJobs, db.collectionJobs);
  for (const field of ["provenance", "collectionJobs", "collectionBudget", "sources"]) assert.equal(field in publicData(db), false);
});
test("spotlights keep legacy selection and exclude missing or unpublished games", () => {
  const db = seedDatabase();
  assert.equal(spotlightGroups(db.entries, db.layout)[0].entries.length, db.layout.featuredIds.length);
  db.layout.spotlights = [{ id: "new", title: "มาใหม่", badge: "เพิ่มเข้าคลังใหม่", entryIds: [db.entries[0].id, "missing"] }];
  assert.equal(spotlightGroups(db.entries, db.layout)[0].entries.length, 1);
  db.entries[0].status = "draft";
  assert.deepEqual(spotlightGroups(db.entries, db.layout), []);
  assert.equal(layoutSchema.safeParse({ ...db.layout, spotlights: [...db.layout.spotlights, ...db.layout.spotlights] }).success, false);
});
test("question evidence is distinct and solution links must be public HTTPS", () => {
  const context = { provider: "Apify", reason: "Community question with research references", signal: { question: "How do I improve terrain art?", topic: "3D และฉาก", evidenceUrls: ["https://www.facebook.com/groups/123/posts/456"], solutions: [{ title: "Official guide", url: "https://docs.unity3d.com/Manual/terrain-UsingTerrains.html", appliesWhen: "For a project using Unity terrain", checkedAt: "2026-10-08", verification: "source-reviewed" }] } };
  assert.ok(collectionContextSchema.safeParse(context).success);
  assert.equal(collectionContextSchema.safeParse({ ...context, signal: { ...context.signal, evidenceUrls: [context.signal.evidenceUrls[0], context.signal.evidenceUrls[0]] } }).success, false);
  assert.equal(collectionContextSchema.safeParse({ ...context, signal: { ...context.signal, solutions: [{ ...context.signal.solutions[0], url: "javascript:alert(1)" }] } }).success, false);
});
