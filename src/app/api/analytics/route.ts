import { isAdmin } from "@/lib/auth";
import { AnalyticsError, analyticsRange, readAnalytics } from "@/lib/analytics";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!(await isAdmin())) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401, headers });
  const range = analyticsRange.safeParse(new URL(request.url).searchParams.get("days") ?? "7");
  if (!range.success) return Response.json({ error: "เลือกช่วงเวลา 7 หรือ 30 วัน" }, { status: 400, headers });
  try {
    return Response.json(await readAnalytics(range.data), { headers });
  } catch (error) {
    const message = error instanceof AnalyticsError ? error.message : "โหลดสถิติไม่ได้ กรุณาลองใหม่ภายหลัง";
    return Response.json({ error: message }, { status: 503, headers });
  }
}
