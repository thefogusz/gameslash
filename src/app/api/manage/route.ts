import { checkOrigin, isAdmin, readBody } from "@/lib/auth";
import { managementMutation, manageCatalog } from "@/lib/catalog-service";
import { readDatabase, storageReady, updateDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";
import { gameLikeCounts } from "@/lib/game-likes";
const adminData = (db: Awaited<ReturnType<typeof readDatabase>>) => ({
  entries: db.entries,
  likeCounts: gameLikeCounts(db),
  customTags: db.customTags,
  tagRequests: db.tagRequests,
  layout: db.layout,
  draftLayout: db.draftLayout,
  revision: db.revision,
  storageReady: storageReady(),
  agents: db.agents.map(({ tokenHash: _hash, ...agent }) => agent),
  activity: db.activity,
  submissions: { ...Object.fromEntries(Object.entries(db.provenance).map(([id, context]) => [id, { context }])), ...Object.fromEntries(Object.entries(db.ingestions).map(([id, { agentId, context }]) => [id, { agentId, context }])) },
  reviews: db.reviews,
});
export async function GET() {
  if (!(await isAdmin())) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    return Response.json(adminData(await readDatabase()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  if (!(await isAdmin())) return Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  try {
    checkOrigin(request);
    const input = managementMutation.parse(await readBody(request));
    let issuedToken: string | undefined;
    const result = await updateDatabase(db => { issuedToken = manageCatalog(db, input); }, input.revision);
    return Response.json({ ...adminData(result), ...(issuedToken ? { issuedToken } : {}) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) { return errorResponse(e); }
}
