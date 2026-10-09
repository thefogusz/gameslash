import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { checkOrigin, fingerprint, readBody } from "@/lib/auth";
import { changeGameLikes, likeMutation } from "@/lib/game-likes";
import { readGameLikes, storageReady, updateDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";

const cookieName = "gameslash-visitor";
const visitorKey = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
const json = (likedIds: string[]) => Response.json({ likedIds }, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  try {
    if (!storageReady()) return Response.json({ error: "ระบบบันทึกหัวใจยังไม่พร้อมใช้งาน" }, { status: 503 });
    const jar = await cookies();
    let token = jar.get(cookieName)?.value || "";
    if (!validToken(token)) {
      token = randomBytes(32).toString("hex");
      jar.set(cookieName, token, { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, path: "/", maxAge: 365 * 24 * 60 * 60 });
      return json([]);
    }
    return json(await readGameLikes(visitorKey(token)));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const token = (await cookies()).get(cookieName)?.value || "";
    if (!validToken(token)) return Response.json({ error: "กรุณาเปิดใช้งานคุกกี้ แล้วโหลดหน้าใหม่เพื่อบันทึกหัวใจ" }, { status: 400 });
    const input = likeMutation.parse(await readBody(request, 320_000));
    const visitor = visitorKey(token);
    const db = await updateDatabase(db => changeGameLikes(db, visitor, input, fingerprint(request)), undefined, false);
    return json(db.gameLikes[visitor] || []);
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "ข้อมูล JSON ไม่ถูกต้อง" }, { status: 400 });
    return errorResponse(error);
  }
}
