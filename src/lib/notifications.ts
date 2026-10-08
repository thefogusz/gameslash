import type { Entry } from "./model";
export type DraftNotification = Pick<Entry, "id" | "title" | "kind" | "status" | "updatedAt">;
export const notificationKey = (item: DraftNotification) => `${item.id}:${item.status}:${item.updatedAt}`;
export function draftNotifications(entries: Entry[]) {
  const drafts = entries.filter(e => e.status === "draft" || e.status === "pending")
    .sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  return { total:drafts.length, items:drafts.slice(0,50).map(({id,title,kind,status,updatedAt}) => ({id,title,kind,status,updatedAt})) };
}
