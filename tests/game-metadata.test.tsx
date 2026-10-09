import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { GameMetadata } from "../src/components/game-metadata";
import { baseGameTags, gameStatusTags, findGameTag } from "../src/lib/game-tags";
import { seedDatabase } from "../src/lib/seed";
import { validateGameTags } from "../src/lib/tag-service";

test("release tags are registered and accepted by the shared write validator", () => {
  const db = seedDatabase();
  for (const status of gameStatusTags) {
    assert.equal(findGameTag(baseGameTags, status.thai)?.name, status.name);
    const entry = { ...db.entries[0], tags: [status.name, "RPG", "PC"] };
    validateGameTags(db, entry);
    assert.deepEqual(entry.tags, [status.name, "RPG", "PC"]);
  }
});
test("metadata separates release stage, platform and genres without guessing absent status", () => {
  const markup = renderToStaticMarkup(<GameMetadata tags={["CBT", "เว็บ", "RPG"]} />);
  assert.match(markup, /สถานะ/); assert.match(markup, /ทดสอบแบบปิด/);
  assert.match(markup, /แพลตฟอร์ม/); assert.match(markup, /ลักษณะเกม/);
  assert.equal((markup.match(/>CBT</g) || []).length, 1);
  const unknown = renderToStaticMarkup(<GameMetadata tags={["RPG"]} />);
  assert.doesNotMatch(unknown, /game-status|Released|CBT/);
  const compact = renderToStaticMarkup(<GameMetadata tags={["OBT", "PC", "RPG"]} compact />);
  assert.doesNotMatch(compact, /OBT|RPG/); assert.match(compact, /PC/);
});


test("compact metadata groups devices without losing full detail or guessing unknown platforms", () => {
  const tags = ["CBT", "เว็บ", "PC", "macOS", "Linux", "Android", "iOS", "RPG"];
  const compact = renderToStaticMarkup(<GameMetadata tags={tags} compact />);
  assert.match(compact, /เล่นบนเว็บ/); assert.match(compact, /มือถือ/);
  assert.equal((compact.match(/>PC</g) || []).length, 1);
  assert.doesNotMatch(compact, />macOS<|>Android<|>CBT<|>RPG</);
  assert.equal(renderToStaticMarkup(<GameMetadata tags={["RPG", "สร้างด้วย AI"]} compact />), "");
  const full = renderToStaticMarkup(<GameMetadata tags={tags} />);
  for (const tag of tags) assert.ok(full.includes(tag));
});
