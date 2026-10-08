import test from "node:test";
import assert from "node:assert/strict";
import { extractCandidates, freeCreditBalance, runCap, runInput } from "../src/lib/apify";
import { collectionContextSchema, databaseSchema, entryInput, layoutSchema, publicData } from "../src/lib/model";
import { seedDatabase } from "../src/lib/seed";
import { manageCatalog } from "../src/lib/catalog-service";
import { spotlightGroups } from "../src/lib/spotlights";
import { reserveFreeBudget } from "../src/lib/collection-model";
test("verified allowance expires and reserves full ceilings without overspending", () => {
  const budget = { remaining: 4.90, expiresAt: new Date(Date.now() + 86400000).toISOString() };
  reserveFreeBudget(budget, runCap(950));
  assert.equal(budget.remaining, 0.05);
  assert.throws(() => reserveFreeBudget(budget, runCap(10)));
  assert.throws(() => reserveFreeBudget(null, runCap(10)));
  assert.throws(() => reserveFreeBudget({ remaining: 5, expiresAt: "2020-01-01T00:00:00.000Z" }, runCap(10)));
});
test("free-credit guard rejects paid, incomplete, stale and overdrawn balances", () => {
  const user = { isPaying: false, plan: { id: "FREE", monthlyBasePriceUsd: 0, monthlyUsageCreditsUsd: 5 } };
  const usage = { totalUsageCreditsUsdAfterVolumeDiscount: 1.2, usageCycle: { startAt: new Date(Date.now() - 86400000).toISOString(), endAt: new Date(Date.now() + 86400000).toISOString() } };
  assert.equal(freeCreditBalance(user, usage), 3.8);
  assert.throws(() => freeCreditBalance({ ...user, isPaying: true }, usage));
  assert.throws(() => freeCreditBalance({ ...user, plan: { ...user.plan, id: "Starter" } }, usage));
  assert.throws(() => freeCreditBalance(user, {}));
  assert.throws(() => freeCreditBalance(user, { ...usage, usageCycle: { ...usage.usageCycle, endAt: "2020-01-01T00:00:00.000Z" } }));
  assert.equal(freeCreditBalance(user, { ...usage, totalUsageCreditsUsdAfterVolumeDiscount: 8 }), 0);
  assert.equal(runCap(950), 4.85);
  assert.equal(runInput("https://www.facebook.com/groups/123", 100).resultsLimit, 100);
  assert.throws(() => runInput("https://facebook.com.evil.test/groups/123", 10));
});
test("dataset extraction removes profile/comment payloads, unsafe URLs and duplicate posts", () => {
  const post = { url: "https://www.facebook.com/groups/123/posts/456?fbclid=x", text: "Useful workflow", user: { name: "Creator", email: "private@example.com" }, topComments: [{ text: "private contact" }] };
  const output = extractCandidates([post, post, { ...post, url: "javascript:alert(1)" }, { error: "unavailable" }]);
  assert.equal(output.length, 1);
  assert.equal(output[0].url, "https://www.facebook.com/groups/123/posts/456");
  assert.equal(JSON.stringify(output).includes("private"), false);
  assert.equal(extractCandidates([{ ...post, url: "https://www.facebook.com/permalink.php?story_fbid=123&id=456" }])[0].url.includes("story_fbid=123"), true);
});
test("collection drafts require a real candidate, stay private, and reject repeat imports", () => {
  const db = seedDatabase(), jobId = crypto.randomUUID(), sourceUrl = "https://www.facebook.com/groups/123/posts/456";
  db.collectionJobs.push({ id: jobId, source: { id: crypto.randomUUID(), name: "Public group", url: "https://www.facebook.com/groups/123" }, createdAt: new Date().toISOString(), status: "SUCCEEDED", limit: 10, runId: "abc123", message: "", candidates: [{ url: sourceUrl, text: "Useful workflow", author: "Creator", time: "" }] });
  const request = { action: "collection_draft" as const, revision: db.revision, jobId, sourceUrl, entry: entryInput.parse({ ...db.entries[0], url: "https://example.com/new-repo", sourceUrl: "https://example.com/untrusted" }) };
  assert.throws(() => manageCatalog(db, { ...request, sourceUrl: "https://example.com/missing" }));
  manageCatalog(db, request);
  assert.equal(db.entries[0].status, "pending");
  assert.equal(db.entries[0].sourceUrl, sourceUrl);
  assert.ok(db.provenance[db.entries[0].id]);
  assert.ok(!publicData(db).entries.some(e => e.id === db.entries[0].id));
  for (const field of ["provenance", "collectionJobs", "sources"]) assert.equal(field in publicData(db), false);
  assert.throws(() => manageCatalog(db, request), /มีฉบับร่าง/);
  databaseSchema.parse(db);
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
