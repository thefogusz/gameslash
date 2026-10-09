import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { getImageProps } from "next/image";
import { seedDatabase } from "../src/lib/seed";

const coverSource = readFileSync(new URL("../src/components/cover.tsx", import.meta.url), "utf8");
const entry = { ...seedDatabase().entries[0], image: `/api/media/${"a".repeat(64)}.webp` };

test("card covers request stored and external images directly without recompression", () => {
  assert.match(coverSource, /\r?\n\s+unoptimized\r?\n/);
  for (const image of [entry.image, "/images/cover.webp", "https://example.com/cover.png"]) {
    const { props } = getImageProps({ src:image, alt:entry.title, fill:true, unoptimized:true, loading:"lazy" });
    const html = renderToStaticMarkup(<img {...props} />);
    assert.ok(html.includes(`src="${image}"`));
    assert.doesNotMatch(html, /srcSet=|_next\/image/);
    assert.match(html, /loading="lazy"/);
  }
});

test("large detail covers use the same full image with eager loading", () => {
  for (const sizes of ["(max-width: 900px) 100vw, 850px", "(max-width: 800px) 100vw, 760px"]) {
    const { props } = getImageProps({ src:entry.image, alt:entry.title, fill:true, unoptimized:true, loading:"eager", sizes });
    const html = renderToStaticMarkup(<img {...props} />);
    assert.ok(html.includes(`src="${entry.image}"`));
    assert.doesNotMatch(html, /srcSet=|_next\/image/);
    assert.match(html, /loading="eager"/);
  }
  assert.ok(coverSource.includes("unoptimized"));
});
