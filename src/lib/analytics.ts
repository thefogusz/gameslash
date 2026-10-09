import { z } from "zod";

export const analyticsRange = z.enum(["7", "30"]);
export class AnalyticsError extends Error {}
const dayMs = 86_400_000;
const metrics = z.object({ visitors: z.number().int().nonnegative(), pageviews: z.number().int().nonnegative() });
const responseSchema = z.object({ data: z.array(metrics.extend({
  environment: z.string().optional(), timestamp: z.iso.datetime().optional(),
  requestPath: z.string().nullable().optional(), referrerHostname: z.string().nullable().optional(),
})) });

export type TrafficReport = {
  days: number; since: string; until: string; updatedAt: string;
  visitors: number; pageviews: number;
  daily: { date: string; visitors: number; pageviews: number }[];
  pages: { label: string; visitors: number; pageviews: number }[];
  referrers: { label: string; visitors: number; pageviews: number }[];
};

export async function readAnalytics(range: z.infer<typeof analyticsRange>, now = new Date()): Promise<TrafficReport> {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  if (!token) throw new AnalyticsError("ยังไม่ได้เชื่อมข้อมูลทราฟฟิค กรุณาตั้งค่าคีย์อ่านสถิติบนเซิร์ฟเวอร์");
  const days = Number(range);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const since = new Date(today - (days - 1) * dayMs).toISOString();
  const until = new Date(today + dayMs - 1).toISOString();
  async function query(by: "environment" | "day" | "requestPath" | "referrerHostname") {
    const params = new URLSearchParams({
      projectId: "prj_RdpviezGM9sHJ65gRSx2S0tSFnZt", teamId: "team_gd46rN4MyUDVae6yIW8pC1Qn",
      since, until, by, limit: "10", filter: "environment eq 'production'",
    });
    const response = await fetch(`https://api.vercel.com/v1/query/web-analytics/visits/aggregate?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new AnalyticsError(response.status === 401 || response.status === 403
      ? "คีย์อ่านสถิติไม่มีสิทธิ์เข้าถึงโปรเจกต์นี้ กรุณาตรวจการเชื่อมต่อบนเซิร์ฟเวอร์"
      : "Vercel ยังส่งสถิติไม่ได้ กรุณาลองใหม่ภายหลัง");
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.data.some(row => !((by === "day" ? "timestamp" : by) in row))) {
      throw new AnalyticsError("รูปแบบข้อมูลสถิติจาก Vercel ไม่ถูกต้อง กรุณาลองใหม่ภายหลัง");
    }
    return parsed.data.data;
  }
  const [totals, daily, pages, referrers] = await Promise.all([
    query("environment"), query("day"), query("requestPath"), query("referrerHostname"),
  ]);
  const total = totals.find(row => row.environment === "production");
  return {
    days, since, until, updatedAt: now.toISOString(), visitors: total?.visitors ?? 0, pageviews: total?.pageviews ?? 0,
    // Unique visitors for the period come from the total query, not a sum of daily visitors.
    daily: Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.parse(since) + i * dayMs).toISOString().slice(0, 10);
      const row = daily.find(row => row.timestamp?.slice(0, 10) === date);
      return { date, visitors: row?.visitors ?? 0, pageviews: row?.pageviews ?? 0 };
    }),
    pages: pages.map(row => ({ label: row.requestPath ?? "อื่น ๆ", visitors: row.visitors, pageviews: row.pageviews })),
    referrers: referrers.map(row => ({ label: row.referrerHostname || "เข้าตรง / ไม่ทราบแหล่งที่มา", visitors: row.visitors, pageviews: row.pageviews })),
  };
}
