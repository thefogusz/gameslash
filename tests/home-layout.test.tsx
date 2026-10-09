import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CatalogSection, GameCard } from "../src/components/directory";
import { Spotlight } from "../src/components/spotlight";
import { GamePreferencesProvider } from "../src/components/game-preferences";
import { seedDatabase } from "../src/lib/seed";

test("home news shows at most five large cards and keeps the full-news link", () => {
  const db = seedDatabase();
  const article = db.entries.find(e => e.kind === "article")!;
  const entries = Array.from({ length: 8 }, (_, i) => ({ ...article, id: `news-${i}` }));
  const section = { id: "news", title: "ข่าวเกม AI", kind: "article" as const, template: "shelf" as const, category: "", enabled: true };
  const markup = renderToStaticMarkup(<CatalogSection section={section} entries={entries} />);
  assert.equal((markup.match(/class="article-card"/g) || []).length, 5);
  assert.match(markup, /template-home-news/);
  assert.match(markup, /href="\/journal"/);
  assert.doesNotMatch(markup, /rail-controls/);
  assert.equal((renderToStaticMarkup(<CatalogSection section={section} entries={entries.slice(0, 2)} />).match(/class="article-card"/g) || []).length, 2);
});

test("curated games render directly below the tabs without the removed note", () => {
  const db = seedDatabase();
  const markup = renderToStaticMarkup(<GamePreferencesProvider><Spotlight entries={db.entries.map(e => ({ ...e, image: "" }))} layout={db.layout} /></GamePreferencesProvider>);
  assert.match(markup, /spotlight-tabs/);
  assert.match(markup, /คัดสรร/);
  assert.match(markup, /ติดเทรนด์/);
  assert.match(markup, /ถูกใจ/);
  assert.doesNotMatch(markup, /ผู้เล่นมากที่สุด/);
  assert.doesNotMatch(markup, /spotlight-note|เกมเด่นที่คัดสรรให้ลองค้นพบ/);
});

test("game cards place the description below the title over the image", () => {
  const game = { ...seedDatabase().entries.find(e => e.kind === "game")!, image: "" };
  const markup = renderToStaticMarkup(<GamePreferencesProvider><GameCard entry={game} /></GamePreferencesProvider>);
  assert.match(markup, /feature-tile game-card-link/);
  assert.match(markup, /feature-copy/);
  assert.match(markup, /<h3>.*?<\/h3><p>.*?<\/p>/);
  assert.match(markup, /href="\/item\//);
  assert.match(markup, /game-like/);
  assert.doesNotMatch(markup, /game-card-author|game-metadata/);
});

test("game shelves expose labelled edge controls without changing grid sections", () => {
  const game = { ...seedDatabase().entries.find(e => e.kind === "game")!, image: "" };
  const section = { id: "discover", title: "มาใหม่", kind: "game" as const, template: "shelf" as const, category: "", enabled: true };
  const render = (template: "shelf" | "grid") => renderToStaticMarkup(<GamePreferencesProvider><CatalogSection section={{ ...section, template }} entries={[game]} /></GamePreferencesProvider>);
  const shelf = render("shelf");
  assert.match(shelf, /class="game-rail"/);
  assert.match(shelf, /aria-label="เลื่อน มาใหม่ ไปทางซ้าย"/);
  assert.match(shelf, /aria-label="เลื่อน มาใหม่ ไปทางขวา"/);
  assert.match(shelf, /aria-controls="[^"]+"/);
  assert.doesNotMatch(render("grid"), /game-rail-arrow/);
});
