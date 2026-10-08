import type { Metadata, MetadataRoute } from "next";
import type { Entry } from "./model";

export function siteOrigin(value = process.env.GAMESLASH_SITE_URL || "https://gameslash.vercel.app") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("GAMESLASH_SITE_URL must be an HTTPS origin without a path, credentials, query or fragment");
  }
  return url.origin;
}
export const indexable = !["preview", "development"].includes(process.env.VERCEL_ENV || "");
export const absoluteUrl = (path: string) => new URL(path, `${siteOrigin()}/`).href;
export const seoDescription = "รวมเกม AI เกมเอไอ เกมที่มี AI NPC และเกมสร้างด้วย AI พร้อมเครื่องมือสร้างเกมและข่าวเกม — Discover AI games, AI-powered NPCs, AI game development tools and news.";
export const seoKeywords = ["GameSlash", "เกม AI", "เกมเอไอ", "รวมเกม AI", "เกมที่มี AI", "เกมสร้างด้วย AI", "AI games", "AI-powered games", "AI NPC", "generative AI games", "AI game directory", "เครื่องมือสร้างเกม", "AI game development tools", "ข่าวเกม AI"];
export const sectionSeo: Record<string, { title: string; description: string; kind?: Entry["kind"] }> = {
  games: { title: "ค้นพบเกม AI และเกมเอไอ | AI Games", description: "ค้นพบเกม AI เกมที่มี AI NPC เกมสร้างด้วย AI ทั้ง RPG ผจญภัย ปริศนา และจำลอง — Explore AI games, AI NPC games and generative AI experiences.", kind: "game" },
  tools: { title: "เครื่องมือ AI สร้างเกม | AI Game Development Tools", description: "ค้นหาเครื่องมือ AI สำหรับสร้างเกม ภาพ แอนิเมชัน โค้ด และระบบ NPC — Discover AI game development tools for art, animation, coding and intelligent characters.", kind: "tool" },
  journal: { title: "ข่าวเกม AI และเทคนิคสร้างเกม | AI Gaming News", description: "อ่านข่าวเกม AI บทความและเทคนิคพัฒนาเกมด้วย AI — AI gaming news, game development articles and generative AI workflows.", kind: "article" },
  community: { title: "คอมมูนิตี้คนสร้างเกม AI | AI Game Dev Community", description: "สำรวจไอเดียและโพสต์จากชุมชนคนสร้างเกม AI — Discover ideas and discussions from the AI game development community.", kind: "post" },
  submit: { title: "ส่งเกมและเครื่องมือ AI | Submit Your AI Game", description: "แนะนำเกม AI หรือเครื่องมือสร้างเกมให้ทีม GameSlash ตรวจสอบก่อนเผยแพร่ — Submit an AI game or game development tool for review." },
};
export function pageMetadata(path: string, title: string, description: string, image?: string): Metadata {
  return {
    title, description, alternates: { canonical: absoluteUrl(path) },
    openGraph: { title, description, url: absoluteUrl(path), type: "website", siteName: "GameSlash", locale: "th_TH", images: [{ url: absoluteUrl(image || "/images/gameslash-social-v3.png"), alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl(image || "/images/gameslash-social-v3.png")] },
  };
}
// Next.js recommends escaping '<' so submitted content cannot close the JSON-LD script.
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
export function collectionSchema(path: string, name: string, entries: Entry[]) {
  return { "@context": "https://schema.org", "@type": "CollectionPage", name, url: absoluteUrl(path), inLanguage: "th", isPartOf: { "@id": absoluteUrl("/#website") }, mainEntity: { "@type": "ItemList", itemListElement: entries.filter(e => e.status === "published").map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.title, url: absoluteUrl(`/item/${e.id}`) })) } };
}
export function entrySchema(entry: Entry) {
  if (entry.status !== "published") throw new Error("Only published entries may appear in structured data");
  const url = absoluteUrl(`/item/${entry.id}`);
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": url, url, name: entry.title, description: entry.description, inLanguage: "th", isPartOf: { "@id": absoluteUrl("/#website") }, mainEntity: { "@id": `${url}#entity` }, breadcrumb: { "@id": `${url}#breadcrumb` } },
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "GameSlash", item: absoluteUrl("/") }, { "@type": "ListItem", position: 2, name: { game: "เกม AI", tool: "เครื่องมือสร้างเกม", article: "ข่าวเกม AI", post: "คอมมูนิตี้" }[entry.kind], item: absoluteUrl(`/${{ game: "games", tool: "tools", article: "journal", post: "community" }[entry.kind]}`) }, { "@type": "ListItem", position: 3, name: entry.title, item: url }] },
    { "@type": { game: "VideoGame", tool: "SoftwareApplication", article: "Article", post: "DiscussionForumPosting" }[entry.kind], "@id": `${url}#entity`, name: entry.title, ...(entry.kind === "article" || entry.kind === "post" ? { headline: entry.title } : {}), description: entry.description, url, mainEntityOfPage: { "@id": url }, ...(entry.image ? { image: absoluteUrl(entry.image) } : {}), ...(entry.url ? { sameAs: entry.url } : {}), keywords: entry.tags.join(", "), ...(entry.kind === "game" ? { genre: entry.category } : {}), ...(entry.kind === "tool" ? { applicationCategory: "DeveloperApplication" } : {}), dateModified: entry.updatedAt },
  ] };
}
export function sitemapEntries(entries: Entry[]): MetadataRoute.Sitemap {
  return ["/", "/games", "/tools", "/journal", "/community"].map(path => ({ url: absoluteUrl(path) })).concat(entries.filter(e => e.status === "published").map(e => ({ url: absoluteUrl(`/item/${e.id}`), lastModified: e.updatedAt })));
}
