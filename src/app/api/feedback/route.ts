import { checkOrigin, fingerprint, readBody } from "@/lib/auth";
import { feedbackInput, reserveFeedback } from "@/lib/feedback";
import { maxImageBytes, saveImage } from "@/lib/media";
import { updateDatabase, storageReady } from "@/lib/store";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!storageReady()) return Response.json({ error: "ระบบรับฟีดแบคยังไม่พร้อม กรุณาลองภายหลัง" }, { status: 503 });
    const input = feedbackInput.parse(await readBody(request, Math.ceil(maxImageBytes * 4 / 3) + 30000));
    await updateDatabase(db => reserveFeedback(db, fingerprint(request)), undefined, false);
    const image = input.image ? (await saveImage(Buffer.from(input.image.split(",")[1], "base64"), undefined, "feedback")).url : "";
    const ticket = { id: crypto.randomUUID(), message: input.message, page: input.page, image, status: "open" as const, createdAt: new Date().toISOString() };
    await updateDatabase(db => {
      if (db.feedback.length >= 3000) throw new Error("คิวฟีดแบคเต็มชั่วคราว กรุณาลองภายหลัง");
      db.feedback.unshift(ticket);
    }, undefined, false);
    return Response.json({ id: ticket.id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
