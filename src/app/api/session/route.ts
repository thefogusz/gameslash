import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authConfigured,
  checkOrigin,
  cookieName,
  createSession,
  equal,
  fingerprint,
  readBody,
} from "@/lib/auth";
import { consumeLimit } from "@/lib/model";
import { updateDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!authConfigured())
      return NextResponse.json(
        { error: "ยังไม่ได้ตั้งค่ารหัสผ่านผู้ดูแลบนเซิร์ฟเวอร์" },
        { status: 503 },
      );
    const { password } = z
      .object({ password: z.string().max(200) })
      .parse(await readBody(request, 2000));
    await updateDatabase((db) =>
      consumeLimit(db, `login:${fingerprint(request)}`, 10, 15 * 60 * 1000),
    );
    if (!equal(password, process.env.ADMIN_PASSWORD!))
      return NextResponse.json(
        { error: "รหัสผ่านไม่ถูกต้อง" },
        { status: 401 },
      );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieName, createSession(), {
      httpOnly: true,
      secure: !!process.env.VERCEL,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: !!process.env.VERCEL,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (e) {
    return errorResponse(e);
  }
}
