import { Directory } from "@/components/directory";
import { publicData } from "@/lib/model";
import { readDatabase } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
import { pageMetadata, seoDescription } from "@/lib/seo";
export const metadata = { ...pageMetadata("/", "GameSlash แพลตฟอร์มรวมเกม AI", seoDescription), title: { absolute: "GameSlash แพลตฟอร์มรวมเกม AI" } };
export const dynamic = "force-dynamic";
export default async function Page() {
  const [db, admin] = await Promise.all([readDatabase(), isAdmin()]);
  return <Directory catalog={publicData(db)} admin={admin} view="home" />;
}
