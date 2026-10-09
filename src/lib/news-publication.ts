import { z } from "zod";
import type { Entry } from "./model";
import receipts from "./news-publication-receipts.json";

const timestamp = z.iso.datetime({ offset: true });
/** Read-only historical evidence; never infer publication from creation or last edit. */
export function newsPublicationAt(entry: Pick<Entry, "id" | "kind" | "sourceUrl" | "createdAt" | "publishedAt">): string | undefined {
  if (entry.kind !== "article") return undefined;
  if (entry.publishedAt && timestamp.safeParse(entry.publishedAt).success) return entry.publishedAt;
  return receipts.entries.find(receipt => receipt.id === entry.id &&
    receipt.expectedKind === entry.kind && receipt.expectedCreatedAt === entry.createdAt &&
    receipt.expectedSourceUrl === entry.sourceUrl)?.publishedAt;
}
