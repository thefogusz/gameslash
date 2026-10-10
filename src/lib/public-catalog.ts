import { cache } from "react";
import { unstable_cache } from "next/cache";
import { publicData } from "./model";
import { readDatabase } from "./store";

// Cache only published data; authorization, drafts and edit versions stay fresh.
export const readPublicCatalog = cache(unstable_cache(
  async () => publicData(await readDatabase()),
  ["gameslash-public-catalog-v1", process.env.GAMESLASH_STORAGE || "local", process.env.GAMESLASH_D1_URL || process.env.GAMESLASH_DATA_DIR || "default"],
  { revalidate: 30 },
));
