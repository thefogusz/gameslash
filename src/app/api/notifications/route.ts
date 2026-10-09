import { isAdmin } from "@/lib/auth";
import { readNotifications } from "@/lib/store";
import { errorResponse } from "@/lib/http";
export async function GET() {
  if (!(await isAdmin())) return Response.json({error:"กรุณาเข้าสู่ระบบ"},{status:401,headers:{"Cache-Control":"no-store"}});
  try { return Response.json(await readNotifications(),{headers:{"Cache-Control":"no-store"}}); }
  catch(e) { return errorResponse(e); }
}
