import { recordEditorialQa } from "../src/lib/editorial-qa";
import type { Database, Entry } from "../src/lib/model";

// Evidence belongs only to these isolated fixtures, never to production content.
export function qaFixture(db: Database, entry: Entry, agentId = db.agents[0].id) {
  const at = new Date().toISOString();
  const images = [...(entry.image ? [entry.image] : []), ...(entry.content?.content.filter(n => n.type === "image").map(n => n.attrs.src) ?? [])];
  recordEditorialQa(db, entry, agentId, {
    claims: [{ claim: "Isolated test fixture source has been checked", sourceUrl: entry.sourceUrl || entry.url || "https://example.com/fixture", checkedAt: at }],
    images: [...new Set(images)].map(src => ({ src, sourceUrl: "https://example.com/fixture-image", credit: "Fixture author", rights: "Permission for isolated test fixtures only", inspectedAt: at })),
    noImageReason: "This isolated fixture does not require an image",
    links: [entry.sourceUrl, entry.url].filter(Boolean),
    render: { method: "client-preview", checkedAt: at, desktop: true, mobile: true, notes: "Isolated fixture rendering inspected for this test only" },
  });
}
