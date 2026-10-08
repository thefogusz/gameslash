import { isAdmin, checkOrigin } from "@/lib/auth";
import { maxImageBytes, saveImage } from "@/lib/media";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error:"กรุณาเข้าสู่ระบบ" }, { status:401 });
  try {
    checkOrigin(request);
    if (!/^image\/(jpeg|png|webp)$/.test(request.headers.get("content-type") || "")) throw new Error("ใช้ภาพ JPG, PNG หรือ WebP");
    const reader = request.body?.getReader(); if (!reader) throw new Error("ไม่มีไฟล์ภาพ");
    const chunks:Uint8Array[] = []; let size=0;
    while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>maxImageBytes) { await reader.cancel(); throw new Error("ภาพต้องมีขนาดไม่เกิน 2 MB"); } chunks.push(value); }
    return Response.json(await saveImage(Buffer.concat(chunks)), { status:201, headers:{"Cache-Control":"no-store"} });
  } catch(e) { return errorResponse(e); }
}
