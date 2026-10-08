import { notFound } from "next/navigation";
import { Directory, type View } from "@/components/directory";
import { publicData } from "@/lib/model";
import { readDatabase } from "@/lib/store";
import { isAdmin } from "@/lib/auth";
const sections = ["games", "tools", "journal", "community", "submit"];
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return {
    title:
      (
        {
          games: "ค้นพบเกม",
          tools: "เครื่องมือ",
          journal: "บทความ",
          community: "คอมมูนิตี้",
          submit: "ส่งเกมของคุณ",
        } as Record<string, string>
      )[section] || "gameslash",
  };
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
  const [db, admin, query] = await Promise.all([
    readDatabase(),
    isAdmin(),
    searchParams,
  ]);
  return (
    <Directory
      catalog={publicData(db)}
      admin={admin}
      view={section as View}
      submitType={query.type}
    />
  );
}
