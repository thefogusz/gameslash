import { readImage } from "@/lib/media";
export const runtime = "nodejs";
export async function GET(_request:Request, {params}:{params:Promise<{id:string}>}) {
  try {
    const image = await readImage((await params).id);
    if (!image) return new Response(null,{status:404});
    return new Response(image,{headers:{"Content-Type":"image/webp","Cache-Control":"public, max-age=31536000, immutable","X-Content-Type-Options":"nosniff"}});
  } catch { return new Response(null,{status:503}); }
}
