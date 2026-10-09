import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Spotlight } from "../src/components/spotlight";
import { GamePreferencesProvider } from "../src/components/game-preferences";
import { seedDatabase } from "../src/lib/seed";

test("only multi-game spotlights run a decorative countdown and expose pause controls", () => {
  const db = seedDatabase();
  const games = db.entries.filter(e => e.kind === "game" && e.status === "published").map(e => ({ ...e, image: "" }));
  const render = (entries: typeof games) => renderToStaticMarkup(<GamePreferencesProvider><Spotlight entries={entries} layout={db.layout} /></GamePreferencesProvider>);
  const multiple = render(games);
  assert.match(multiple, /data-running="true"/);
  assert.match(multiple, /class="spotlight-progress" aria-hidden="true"/);
  assert.match(multiple, /aria-label="หยุดสไลด์อัตโนมัติ"/);
  const single = render(games.slice(0, 1));
  assert.match(single, /data-running="false"/);
  assert.doesNotMatch(single, /spotlight-progress|หยุดสไลด์อัตโนมัติ/);
});
