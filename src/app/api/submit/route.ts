import { tagSuggestionsSchema } from "@/lib/game-tags";
import { requestGameTags, validateGameTags } from "@/lib/tag-service";
import { z } from "zod";
import { checkOrigin, fingerprint, readBody } from "@/lib/auth";
import {
  checkDuplicate,
  consumeLimit,
  entryInput,
  type Entry,
} from "@/lib/model";
import { storageReady, updateDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!storageReady())
      return Response.json(
        { error: "ระบบรับรายการยังไม่เปิดใช้งาน กรุณากลับมาอีกครั้ง" },
        { status: 503 },
      );
    const raw = z
      .object({ entry: entryInput, tagSuggestions: tagSuggestionsSchema, website: z.string().max(500).default("") })
      .parse(await readBody(request, 40000));
    if (raw.website) return Response.json({ ok: true });
    if (!["game", "post"].includes(raw.entry.kind))
      throw new Error("ส่งได้เฉพาะเกมหรือโพสต์คอมมูนิตี้");
    const item: Entry = {
      ...raw.entry,
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await updateDatabase((db) => {
      consumeLimit(db, `submit:${fingerprint(request)}`, 5, 60 * 60 * 1000);
      if (db.entries.filter((e) => e.status === "pending").length >= 300)
        throw new Error("คิวตรวจรายการเต็มชั่วคราว กรุณาลองภายหลัง");
      validateGameTags(db, item);
      requestGameTags(db, item, raw.tagSuggestions);
      checkDuplicate(db.entries, item);
      db.entries.unshift(item);
    });
    return Response.json({ ok: true, id: item.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
