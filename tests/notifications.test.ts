import test from "node:test";
import assert from "node:assert/strict";
import { draftNotifications,notificationKey } from "../src/lib/notifications";
import { seedDatabase } from "../src/lib/seed";
test("notifications expose only draft metadata, newest first, with a bounded feed",()=>{
  const sample=seedDatabase().entries[0];
  const entries=Array.from({length:55},(_,i)=>({...sample,id:String(i),status:"draft" as const,updatedAt:new Date(2026,0,i+1).toISOString(),body:"Private body"}));
  const feed=draftNotifications([...entries,{...sample,status:"published"},{...sample,status:"archived"}]);
  assert.equal(feed.total,55);assert.equal(feed.items.length,50);assert.equal(feed.items[0].id,"54");
  assert.equal("body" in feed.items[0],false);assert.equal("sourceUrl" in feed.items[0],false);
  assert.notEqual(notificationKey(feed.items[0]),notificationKey({...feed.items[0],status:"pending"}));
  assert.notEqual(notificationKey(feed.items[0]),notificationKey({...feed.items[0],updatedAt:new Date().toISOString()}));
});
