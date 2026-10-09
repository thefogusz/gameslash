import type { Metadata, MetadataRoute } from "next";
import type { Entry } from "./model";

export function siteOrigin(value = process.env.GAMESLASH_SITE_URL || "https://gameslash.app") {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("GAMESLASH_SITE_URL must be an HTTPS origin without a path, credentials, query or fragment");
  }
  return url.origin;
}
export const indexable = !["preview", "development"].includes(process.env.VERCEL_ENV || "");
export const absoluteUrl = (path: string) => new URL(path, `${siteOrigin()}/`).href;
export const seoDescription = "รวมเกมที่สร้างด้วย AI พร้อมเครื่องมือ เทคนิค และข่าวสำหรับคนสร้างเกมด้วย AI — Discover games made with AI, AI game development tools, workflows and news.";
export const seoKeywords = ["GameSlash", "เกมสร้างด้วย AI", "เกมที่สร้างด้วย AI", "สร้างเกมด้วย AI", "รวมเกมสร้างด้วย AI", "games made with AI", "AI-assisted game development", "AI-made games", "เครื่องมือสร้างเกม", "AI game development tools", "เทคนิคสร้างเกมด้วย AI"];
export const sectionSeo: Record<string, { title: string; description: string; kind?: Entry["kind"] }> = {
  games: { title: "ค้นพบเกมที่สร้างด้วย AI | Games Made with AI", description: "ค้นพบเกมที่ผู้สร้างใช้ AI ช่วยพัฒนา ทั้ง RPG ผจญภัย ปริศนา และจำลอง — Explore games made with AI across RPG, adventure, puzzle and simulation genres.", kind: "game" },
  tools: { title: "เครื่องมือ AI สร้างเกม | AI Game Development Tools", description: "ค้นหาเครื่องมือ AI ช่วยสร้างเกม เขียนโค้ด ทำภาพ แอนิเมชัน เสียง และเนื้อเรื่อง — Discover AI tools for game development, coding, art, animation, audio and storytelling.", kind: "tool" },
  journal: { title: "ข่าวและเทคนิคสร้างเกมด้วย AI | AI Game Development News", description: "อ่านข่าว บทความ และเทคนิคสร้างเกมด้วย AI — Read AI-assisted game development news, articles and workflows.", kind: "article" },
  community: { title: "คอมมูนิตี้คนสร้างเกมด้วย AI | AI Game Dev Community", description: "สำรวจไอเดียและโพสต์จากชุมชนคนสร้างเกมด้วย AI — Discover ideas and discussions from creators making games with AI.", kind: "post" },
  submit: { title: "ส่งเกมที่สร้างด้วย AI และเครื่องมือ | Submit Your Game", description: "แนะนำเกมที่สร้างด้วย AI หรือเครื่องมือช่วยสร้างเกมให้ทีม GameSlash ตรวจสอบก่อนเผยแพร่ — Submit a game made with AI or a game development tool for review." },
};
export function pageMetadata(path: string, title: string, description: string, image?: string): Metadata {
  return {
    title, description, alternates: { canonical: absoluteUrl(path) },
    openGraph: { title, description, url: absoluteUrl(path), type: "website", siteName: "GameSlash", locale: "th_TH", images: [{ url: absoluteUrl(image || "/images/gameslash-social-v4.png"), alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [absoluteUrl(image || "/images/gameslash-social-v4.png")] },
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
    { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "GameSlash", item: absoluteUrl("/") }, { "@type": "ListItem", position: 2, name: { game: "เกมที่สร้างด้วย AI", tool: "เครื่องมือสร้างเกม", article: "ข่าวสร้างเกมด้วย AI", post: "คอมมูนิตี้" }[entry.kind], item: absoluteUrl(`/${{ game: "games", tool: "tools", article: "journal", post: "community" }[entry.kind]}`) }, { "@type": "ListItem", position: 3, name: entry.title, item: url }] },
    { "@type": { game: "VideoGame", tool: "SoftwareApplication", article: "Article", post: "DiscussionForumPosting" }[entry.kind], "@id": `${url}#entity`, name: entry.title, ...(entry.kind === "article" || entry.kind === "post" ? { headline: entry.title } : {}), description: entry.description, url, mainEntityOfPage: { "@id": url }, ...(entry.image ? { image: absoluteUrl(entry.image) } : {}), ...(entry.url ? { sameAs: entry.url } : {}), keywords: entry.tags.join(", "), ...(entry.kind === "game" ? { genre: entry.category } : {}), ...(entry.kind === "tool" ? { applicationCategory: "DeveloperApplication" } : {}), dateModified: entry.updatedAt },
  ] };
}
export function sitemapEntries(entries: Entry[]): MetadataRoute.Sitemap {
  return ["/", "/games", "/tools", "/journal", "/community"].map(path => ({ url: absoluteUrl(path) })).concat(entries.filter(e => e.status === "published").map(e => ({ url: absoluteUrl(`/item/${e.id}`), lastModified: e.updatedAt })));
}
