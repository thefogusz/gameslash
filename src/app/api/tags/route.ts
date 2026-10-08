import { gameTags, tagSource, tagSourceDate } from "@/lib/game-tags";
import { readDatabase } from "@/lib/store";
import { errorResponse } from "@/lib/http";

export async function GET() {
  try {
    return Response.json({ tags: gameTags(await readDatabase()), source: tagSource, checkedAt: tagSourceDate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
