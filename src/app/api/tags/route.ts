import { gameTags, tagSource, tagSourceDate } from "@/lib/game-tags";
import { readCustomTags } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    return Response.json({ tags: gameTags({ customTags: await readCustomTags() }), source: tagSource, checkedAt: tagSourceDate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
