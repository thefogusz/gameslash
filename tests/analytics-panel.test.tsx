import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyticsPanel } from "../src/components/analytics-panel";
import { seedDatabase } from "../src/lib/seed";
import type { Entry } from "../src/lib/model";

test("Console shows ranked game likes even before Vercel loads, without private visitor data", () => {
  const game = seedDatabase().entries.find(entry => entry.kind === "game")!;
  const entries: Entry[] = [
    { ...game, id: "one", title: "อันดับสอง" },
    { ...game, id: "two", title: "อันดับหนึ่ง" },
    { ...game, id: "archived", title: "เกมเก่า", status: "archived" },
    { ...game, id: "zero", title: "ไม่มีหัวใจ" },
    { ...game, id: "news", title: "ข่าว", kind: "article" },
  ];
  const counts = { one: 1, two: 12, archived: 2, zero: 0, news: 100, missing: 50 };
  const html = renderToStaticMarkup(<AnalyticsPanel entries={entries} likeCounts={counts} onRefresh={() => {}} refreshing={false} />);
  assert.ok(html.indexOf("อันดับหนึ่ง") < html.indexOf("เกมเก่า"));
  assert.ok(html.indexOf("เกมเก่า") < html.indexOf("อันดับสอง"));
  assert.match(html, /href="\/item\/two"/);
  assert.doesNotMatch(html, /href="\/item\/archived"|ไม่มีหัวใจ|ข่าว|missing|visitorId|gameLikes/);
  assert.match(html, /<td>12<\/td>/);
  assert.match(html, /รวมทุกช่วงเวลา/);
  assert.deepEqual(entries.map(entry => entry.id), ["one", "two", "archived", "zero", "news"]);
});

test("Console explains when no games have likes", () => {
  const html = renderToStaticMarkup(<AnalyticsPanel entries={seedDatabase().entries} likeCounts={{}} onRefresh={() => {}} refreshing={false} />);
  assert.match(html, /ยังไม่มีเกมที่ถูกกดไลค์/);
  assert.doesNotMatch(html, /<table/);
});
