import { notFound } from "next/navigation";
import { Directory, type View } from "@/components/directory";
import { readPublicCatalog } from "@/lib/public-catalog";
import { isAdmin } from "@/lib/auth";
import { collectionSchema, indexable, jsonLd, pageMetadata, sectionSeo } from "@/lib/seo";
import { filterDirectory } from "@/lib/directory-filters";
const sections = ["games", "tools", "journal", "community", "submit"];
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  const seo = sectionSeo[section];
  return { ...pageMetadata(`/${section}`, seo.title, seo.description), ...(section === "submit" || !indexable ? { robots: { index: false, follow: true } } : {}) };
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ category?: string; type?: string; sort?: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  const [catalog, admin, query] = await Promise.all([
    readPublicCatalog(),
    isAdmin(),
    searchParams,
  ]);
  return (
    <>
    {section !== "submit" && !Object.values(query).some(Boolean) && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema(`/${section}`, sectionSeo[section].title, filterDirectory(catalog.entries, { kind: sectionSeo[section].kind!, query: "", category: "", tag: "", sort: "curated" }, catalog.layout.featuredIds))) }} />}
    <Directory
      catalog={catalog}
      admin={admin}
      view={section as View}
      submitType={query.type}
    />
    </>
  );
}
