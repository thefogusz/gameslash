import { z } from "zod";
import { checkOrigin, isAdmin, readBody } from "@/lib/auth";
import { readDatabase, updateDatabase } from "@/lib/store";
import { sourceSchema, activeJob, reserveFreeBudget } from "@/lib/collection-model";
import { apifyRequest, apifyRunSchema, APIFY_ACTOR, runCap, runInput, extractCandidates } from "@/lib/apify";
import { errorResponse } from "@/lib/http";
export const runtime = "nodejs";
export const maxDuration = 60;
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("source"), source: sourceSchema, revision: z.number().int() }),
  z.object({ action: z.literal("remove_source"), id: z.string().uuid(), revision: z.number().int() }),
  z.object({ action: z.literal("start"), sourceId: z.string().uuid(), requestId: z.string().uuid(), limit: z.union([z.literal(10), z.literal(100), z.literal(950)]) }),
  z.object({ action: z.literal("sync"), id: z.string().uuid(), runId: z.string().regex(/^[a-zA-Z0-9]+$/).max(100).optional() }),
]);
async function snapshot(request: Request) {
  const db = await readDatabase();
  const params = new URL(request.url).searchParams;
  const selected = params.get("jobId") || db.collectionJobs[0]?.id;
  const query = (params.get("query") || "").slice(0, 200).toLowerCase();
  const page = Math.max(0, Math.min(100, Number(params.get("page")) || 0));
  const jobs = db.collectionJobs.map(job => {
    const matches = job.id === selected ? job.candidates.filter(c => `${c.text} ${c.author}`.toLowerCase().includes(query)) : [];
    return { ...job, candidateCount: job.candidates.length, matchCount: matches.length, candidates: matches.slice(page * 12, page * 12 + 12) };
  });
  return { sources: db.sources, jobs, budget: db.collectionBudget, revision: db.revision, configured: !!process.env.APIFY_TOKEN };
}
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try { return json(await snapshot(request)); } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    checkOrigin(request);
    const input = mutation.parse(await readBody(request, 10000));
    if (input.action === "source" || input.action === "remove_source") {
      await updateDatabase(db => {
        if (input.action === "source") {
          if (db.sources.some(s => s.id !== input.source.id && s.url.replace(/\/$/, "") === input.source.url.replace(/\/$/, ""))) throw new Error("มีแหล่งข้อมูลนี้แล้ว");
          db.sources = [...db.sources.filter(s => s.id !== input.source.id), input.source];
        } else db.sources = db.sources.filter(s => s.id !== input.id);
      }, input.revision);
    } else if (input.action === "start") {
      if (!process.env.APIFY_TOKEN) throw new Error("ยังไม่ได้เชื่อม Apify");
      const old = await readDatabase();
      if (old.collectionJobs.some(j => j.id === input.requestId)) return json(await snapshot(request));
      const reserved = await updateDatabase(db => {
        if (db.collectionJobs.some(j => j.id === input.requestId)) throw new Error("คำขอนี้บันทึกแล้ว กรุณาโหลดสถานะล่าสุด");
        if (db.collectionJobs.some(activeJob)) throw new Error("มีงานกำลังทำหรือยังไม่ทราบผล กรุณาตรวจงานเดิมก่อน");
        const source = db.sources.find(s => s.id === input.sourceId);
        if (!source) throw new Error("ไม่พบแหล่งข้อมูล");
        if (db.collectionJobs.length >= 100) throw new Error("ครบ 100 งานทดลองแล้ว กรุณาจัดการประวัติก่อนเริ่มเพิ่ม");
        reserveFreeBudget(db.collectionBudget, runCap(input.limit));
        db.collectionJobs.unshift({ id: input.requestId, source, createdAt: new Date().toISOString(), status: "starting", limit: input.limit, candidates: [], message: "" });
      });
      try {
        // Never retry a paid POST: a lost response may already have started a run.
        const result = await apifyRequest(`acts/${APIFY_ACTOR}/runs?waitForFinish=0&timeout=600&maxTotalChargeUsd=${runCap(input.limit)}`, runInput(reserved.collectionJobs[0].source.url, input.limit));
        const run = apifyRunSchema.parse(result.data);
        await updateDatabase(db => { const job = db.collectionJobs.find(j => j.id === input.requestId)!; job.runId = run.id; job.status = run.status; });
      } catch {
        await updateDatabase(db => { const job = db.collectionJobs.find(j => j.id === input.requestId)!; job.status = "unknown"; job.message = "ยังยืนยันผลไม่ได้ ระบบไม่เริ่มซ้ำ เปิด Apify ตรวจงานและใส่ Run ID เพื่อเชื่อมกลับ"; });
      }
    } else {
      const db = await readDatabase(), job = db.collectionJobs.find(j => j.id === input.id);
      if (!job) throw new Error("ไม่พบงาน");
      const runId = job.runId || input.runId;
      if (!runId) throw new Error("กรุณาระบุ Run ID จาก Apify");
      const result = await apifyRequest(`actor-runs/${runId}`), run = apifyRunSchema.parse(result.data);
      if (!job.runId) {
        const details = z.object({ defaultKeyValueStoreId: z.string().regex(/^[a-zA-Z0-9]+$/) }).parse(result.data);
        const original = await apifyRequest(`key-value-stores/${details.defaultKeyValueStoreId}/records/INPUT`);
        if (!Array.isArray(original.startUrls) || original.startUrls.length !== 1 || original.startUrls[0]?.url?.replace(/\/$/, "") !== job.source.url.replace(/\/$/, "")) throw new Error("Run นี้ไม่ตรงกับแหล่งข้อมูลที่เลือก");
      }
      const candidates = extractCandidates(await apifyRequest(`datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=${job.limit}&fields=url,text,time,user`));
      await updateDatabase(current => { const item = current.collectionJobs.find(j => j.id === input.id)!; if (item.runId && item.runId !== run.id) throw new Error("งานถูกเชื่อมกับ Run อื่นแล้ว"); item.runId = run.id; item.status = run.status; item.cost = run.usageTotalUsd; item.message = ""; if (candidates) item.candidates = candidates; });
    }
    return json(await snapshot(request));
  } catch (e) { return errorResponse(e); }
}
