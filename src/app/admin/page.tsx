import { isAdmin, authConfigured } from "@/lib/auth";
import { Admin, Login } from "@/components/admin";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "จัดการเว็บ",
  robots: { index: false, follow: false },
};
export default async function Page() {
  return (await isAdmin()) ? (
    <Admin />
  ) : (
    <Login configured={authConfigured()} />
  );
}
