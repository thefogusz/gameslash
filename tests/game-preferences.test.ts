import test from "node:test";
import assert from "node:assert/strict";
import { readLikedIds, recommendGames } from "../src/lib/game-preferences";
import { spotlightGroups } from "../src/lib/spotlights";
import { seedDatabase } from "../src/lib/seed";

test("liked IDs tolerate corrupted, old and untrusted local storage", () => {
  assert.deepEqual(readLikedIds(null), []);
  assert.deepEqual(readLikedIds("broken"), []);
  assert.deepEqual(readLikedIds('{"version":2,"likedIds":["game"]}'), []);
  assert.deepEqual(readLikedIds(JSON.stringify({version:1,likedIds:["game", "game", 1, null, "<script>", "", "valid-id"]})), ["game", "valid-id"]);
  assert.equal(readLikedIds(JSON.stringify({version:1,likedIds:Array.from({length:3100},(_,i)=>`game-${i}`)})).length,3000);
});

test("recommendations prioritize similar genres, exclude liked and private games, and undo cleanly", () => {
  const db=seedDatabase();
  const original=JSON.stringify(db.entries);
  const ranked=recommendGames([...db.entries,{...db.entries[0],id:"private",category:"RPG",status:"draft"}], ["ai-dungeon", "missing-id"], db.layout.featuredIds);
  assert.equal(ranked[0].entry.id,"narrator");
  assert.ok(ranked[0].score>0);
  assert.ok(ranked.every(e=>!["ai-dungeon","private"].includes(e.entry.id)));
  assert.equal(recommendGames(db.entries,[],db.layout.featuredIds)[0].entry.id,db.layout.featuredIds[0]);
  assert.equal(recommendGames(db.entries,db.entries.map(e=>e.id),db.layout.featuredIds).length,0);
  assert.equal(JSON.stringify(db.entries),original);
});

test("genre names never become spotlight tabs while editorial collections remain", () => {
  const db=seedDatabase();
  db.layout.spotlights=[
    {id:"rpg",title:"RPG",badge:"RPG",entryIds:["ai-dungeon"]},
    {id:"popular",title:"ยอดนิยม",badge:"ทีมงานคัดเลือก",entryIds:["infinite-craft"]},
  ];
  assert.deepEqual(spotlightGroups(db.entries,db.layout).map(g=>g.title),["ยอดนิยม"]);
});
