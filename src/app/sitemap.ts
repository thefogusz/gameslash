import { readDatabase } from "@/lib/store";
import { indexable, sitemapEntries } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap() {
  return indexable ? sitemapEntries((await readDatabase()).entries) : [];
}
