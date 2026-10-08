import type { Entry, Layout } from "./model";
export function spotlightGroups(entries: Entry[], layout: Layout) {
  const groups = layout.spotlights.length ? layout.spotlights : [{ id: "featured", title: "คัดสรร", badge: "เกมแนะนำ", entryIds: layout.featuredIds }];
  return groups.filter(group => !layout.categories.some(category => category.toLocaleLowerCase() === group.title.trim().toLocaleLowerCase()))
    .map(group => ({ ...group, entries: group.entryIds.map(id => entries.find(e => e.id === id && e.kind === "game" && e.status === "published")).filter((e): e is Entry => !!e) })).filter(group => group.entries.length);
}
