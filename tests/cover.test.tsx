import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { getImageProps } from "next/image";
import { seedDatabase } from "../src/lib/seed";

const coverSource = readFileSync(new URL("../src/components/cover.tsx", import.meta.url), "utf8");
const entry = { ...seedDatabase().entries[0], image: `/api/media/${"a".repeat(64)}.webp` };

test("cover retains card image sizing by default", () => {
  assert.ok(coverSource.includes('sizes = "(max-width: 700px) 90vw, 40vw"'));
  assert.ok(coverSource.includes("sizes={sizes}"));
  const { props } = getImageProps({ src: entry.image, alt: entry.title, fill: true, sizes: "(max-width: 700px) 90vw, 40vw", loading: "lazy" });
  const html = renderToStaticMarkup(<img {...props} />);
  assert.match(html, /sizes="\(max-width: 700px\) 90vw, 40vw"/);
  assert.match(html, /loading="lazy"/);
});

test("detail covers advertise sufficient width without changing card sizing", () => {
  for (const sizes of ["(max-width: 900px) 100vw, 850px", "(max-width: 800px) 100vw, 760px"]) {
    const { props } = getImageProps({ src: entry.image, alt: entry.title, fill: true, sizes, loading: "eager" });
    const html = renderToStaticMarkup(<img {...props} />);
    assert.ok(html.includes(`sizes="${sizes}"`));
    assert.match(html, /1080w/);
    assert.match(html, /loading="eager"/);
    assert.doesNotMatch(html, /40vw/);
  }
  const source = readFileSync(new URL("../src/components/directory.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('<Cover entry={entry} priority sizes="(max-width: 900px) 100vw, 850px" />'));
  assert.ok(source.includes('<Cover entry={entry} priority sizes="(max-width: 800px) 100vw, 760px" />'));
});
