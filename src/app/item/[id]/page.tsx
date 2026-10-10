import { notFound } from "next/navigation";
import { entryCover } from "@/lib/article";
import { Directory } from "@/components/directory";
import { readPublicCatalog } from "@/lib/public-catalog";
import { isAdmin } from "@/lib/auth";
import { entrySchema, jsonLd, pageMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = (await readPublicCatalog()).entries.find(
    (e) => e.id === id && e.status === "published",
  );
  if (!e) notFound();
  return { ...pageMetadata(`/item/${e.id}`, e.title, e.description, entryCover(e).src || undefined), keywords: e.tags };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [catalog, admin] = await Promise.all([readPublicCatalog(), isAdmin()]);
  const item = catalog.entries.find((e) => e.id === id);
  if (!item) notFound();
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(entrySchema(item)) }} />
    <Directory catalog={catalog} admin={admin} view="detail" item={item} />
    </>
  );
}
