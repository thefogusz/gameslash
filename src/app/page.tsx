import { Directory } from "@/components/directory";
import { readPublicCatalog } from "@/lib/public-catalog";
import { isAdmin } from "@/lib/auth";
import { pageMetadata, seoDescription } from "@/lib/seo";
export const metadata = { ...pageMetadata("/", "GameSlash รวมเกมเอไอ", seoDescription), title: { absolute: "GameSlash แพลตฟอร์มรวมเกม AI" } };
export const dynamic = "force-dynamic";
export default async function Page() {
  const [catalog, admin] = await Promise.all([readPublicCatalog(), isAdmin()]);
  return <Directory catalog={catalog} admin={admin} view="home" />;
}
