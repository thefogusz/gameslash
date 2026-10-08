import { Directory } from "@/components/directory";
import { publicData } from "@/lib/model";
import { readDatabase } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const [db, admin] = await Promise.all([readDatabase(), isAdmin()]);
  return <Directory catalog={publicData(db)} admin={admin} view="home" />;
}
