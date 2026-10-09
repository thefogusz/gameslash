import test from "node:test";
import assert from "node:assert/strict";
import { AnalyticsError, analyticsRange, readAnalytics } from "../src/lib/analytics";

test("traffic uses production totals, fills missing dates, and keeps visitors distinct across days", async t => {
  const original = process.env.VERCEL_ANALYTICS_TOKEN;
  process.env.VERCEL_ANALYTICS_TOKEN = "isolated-analytics-test-token";
  t.after(() => { if (original === undefined) delete process.env.VERCEL_ANALYTICS_TOKEN; else process.env.VERCEL_ANALYTICS_TOKEN = original; });
  const queries: URL[] = [];
  const rows: Record<string, unknown[]> = {
    environment: [{ environment: "production", visitors: 3, pageviews: 7 }],
    day: [
      { timestamp: "2026-10-08T00:00:00.000Z", visitors: 3, pageviews: 3 },
      { timestamp: "2026-10-09T00:00:00.000Z", visitors: 3, pageviews: 4 },
      { timestamp: "2026-10-10T00:00:00.000Z", visitors: 99, pageviews: 99 },
    ],
    requestPath: [{ requestPath: "/", visitors: 3, pageviews: 7, visitorId: "must-not-leak" }],
    referrerHostname: [{ referrerHostname: "", visitors: 2, pageviews: 6 }],
  };
  t.mock.method(globalThis, "fetch", async (input: string, options: RequestInit) => {
    const url = new URL(input); queries.push(url);
    assert.equal(url.origin, "https://api.vercel.com");
    assert.equal(url.searchParams.get("filter"), "environment eq 'production'");
    assert.equal(url.searchParams.get("projectId"), "prj_RdpviezGM9sHJ65gRSx2S0tSFnZt");
    assert.equal(url.searchParams.get("teamId"), "team_gd46rN4MyUDVae6yIW8pC1Qn");
    assert.deepEqual(options.headers, { Authorization: "Bearer isolated-analytics-test-token" });
    return Response.json({ data: rows[url.searchParams.get("by")!] });
  });
  const report = await readAnalytics("7", new Date("2026-10-09T18:30:00Z"));
  assert.equal(report.visitors, 3); // Same people can visit on several days.
  assert.equal(report.pageviews, 7);
  assert.equal(report.daily.length, 7);
  assert.deepEqual(report.daily[0], { date: "2026-10-03", visitors: 0, pageviews: 0 });
  assert.equal(report.daily.at(-1)?.date, "2026-10-09");
  assert.equal(report.referrers[0].label, "เข้าตรง / ไม่ทราบแหล่งที่มา");
  assert.equal(queries.length, 4);
  assert.doesNotMatch(JSON.stringify(report), /isolated-analytics-test-token|must-not-leak/);
});

test("traffic rejects missing credentials, upstream failures and malformed metrics without leaking upstream data", async t => {
  const original = process.env.VERCEL_ANALYTICS_TOKEN;
  t.after(() => { if (original === undefined) delete process.env.VERCEL_ANALYTICS_TOKEN; else process.env.VERCEL_ANALYTICS_TOKEN = original; });
  delete process.env.VERCEL_ANALYTICS_TOKEN;
  await assert.rejects(readAnalytics("7"), /ยังไม่ได้เชื่อม/);
  process.env.VERCEL_ANALYTICS_TOKEN = "isolated-analytics-test-token";
  let response = Response.json({ error: "private-upstream-diagnostics" }, { status: 403 });
  t.mock.method(globalThis, "fetch", async () => response.clone());
  await assert.rejects(readAnalytics("7"), error => error instanceof AnalyticsError && !error.message.includes("private-upstream") && error.message.includes("ไม่มีสิทธิ์"));
  response = Response.json({ data: [{ visitors: -1, pageviews: 7 }] });
  await assert.rejects(readAnalytics("7"), /รูปแบบข้อมูล/);
  response = Response.json({ data: [{ visitors: 1, pageviews: 7 }] });
  await assert.rejects(readAnalytics("7"), /รูปแบบข้อมูล/);
});

test("traffic supports the Hobby reporting window and an empty period", async t => {
  assert.equal(analyticsRange.safeParse("365").success, false);
  const original = process.env.VERCEL_ANALYTICS_TOKEN;
  process.env.VERCEL_ANALYTICS_TOKEN = "isolated-analytics-test-token";
  t.after(() => { if (original === undefined) delete process.env.VERCEL_ANALYTICS_TOKEN; else process.env.VERCEL_ANALYTICS_TOKEN = original; });
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [] }));
  const report = await readAnalytics("30", new Date("2026-10-09T18:30:00Z"));
  assert.equal(report.daily.length, 30);
  assert.equal(report.visitors, 0);
  assert.equal(report.pageviews, 0);
  assert.deepEqual(report.pages, []);
});
