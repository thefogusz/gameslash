import { notFound } from "next/navigation";
import { Directory } from "@/components/directory";
import { publicData } from "@/lib/model";
import { readDatabase } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { entrySchema, jsonLd, pageMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const e = (await readDatabase()).entries.find(
    (e) => e.id === id && e.status === "published",
  );
  if (!e) notFound();
  return { ...pageMetadata(`/item/${e.id}`, e.title, e.description, e.image || undefined), keywords: e.tags };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [db, admin] = await Promise.all([readDatabase(), isAdmin()]);
  const catalog = publicData(db);
  const item = catalog.entries.find((e) => e.id === id);
  if (!item) notFound();
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(entrySchema(item)) }} />
    <Directory catalog={catalog} admin={admin} view="detail" item={item} />
    </>
  );
}
