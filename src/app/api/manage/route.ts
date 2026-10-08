import { z } from "zod";
import { checkOrigin, isAdmin, readBody } from "@/lib/auth";
import {
  checkDuplicate,
  entryInput,
  entrySchema,
  layoutSchema,
  type Entry,
} from "@/lib/model";
import { readDatabase, storageReady, updateDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";
const mutation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("entry"),
    revision: z.number().int(),
    entry: entrySchema,
  }),
  z.object({
    action: z.literal("layout"),
    revision: z.number().int(),
    layout: layoutSchema,
    publish: z.boolean(),
  }),
  z.object({
    action: z.literal("import"),
    revision: z.number().int(),
    entries: z.array(entryInput).min(1).max(50),
  }),
]);
const adminData = (db: Awaited<ReturnType<typeof readDatabase>>) => ({
  entries: db.entries,
  layout: db.layout,
  draftLayout: db.draftLayout,
  revision: db.revision,
  storageReady: storageReady(),
});
export async function GET() {
  if (!(await isAdmin()))
    return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    return Response.json(adminData(await readDatabase()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    checkOrigin(request);
    const input = mutation.parse(await readBody(request));
    const result = await updateDatabase((db) => {
      if (input.action === "entry") {
        const old = db.entries.find((e) => e.id === input.entry.id);
        const item = {
          ...input.entry,
          createdAt: old?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        checkDuplicate(db.entries, item);
        db.entries = old
          ? db.entries.map((e) => (e.id === item.id ? item : e))
          : [item, ...db.entries];
      } else if (input.action === "layout") {
        if (
          input.layout.featuredIds.some(
            (id) =>
              !db.entries.some(
                (e) =>
                  e.id === id && e.kind === "game" && e.status === "published",
              ),
          )
        )
          throw new Error("เลือกเกมแนะนำจากรายการที่เผยแพร่แล้วเท่านั้น");
        db.draftLayout = input.layout;
        if (input.publish) db.layout = structuredClone(input.layout);
      } else {
        for (const data of input.entries) {
          const item: Entry = {
            ...data,
            id: crypto.randomUUID(),
            status: "draft",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          checkDuplicate(db.entries, item);
          db.entries.unshift(item);
        }
      }
    }, input.revision);
    return Response.json(adminData(result));
  } catch (e) {
    return errorResponse(e);
  }
}
