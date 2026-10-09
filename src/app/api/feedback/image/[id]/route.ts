import { isAdmin } from "@/lib/auth";
import { readImage } from "@/lib/media";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response(null, { status: 401 });
  try {
    const image = await readImage((await params).id, "feedback");
    return new Response(image, { status: image ? 200 : 404, headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 503 }); }
}
