import { isAdmin } from "@/lib/auth";
import { readDatabase } from "@/lib/store";
import { draftNotifications } from "@/lib/notifications";
import { errorResponse } from "@/lib/http";
export async function GET() {
  if (!(await isAdmin())) return Response.json({error:"กรุณาเข้าสู่ระบบ"},{status:401,headers:{"Cache-Control":"no-store"}});
  try { return Response.json(draftNotifications((await readDatabase()).entries),{headers:{"Cache-Control":"no-store"}}); }
  catch(e) { return errorResponse(e); }
}
