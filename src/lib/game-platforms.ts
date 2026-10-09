/** Discovery groups use only explicit editorial tags, never a URL or user agent. */
export const platformGroups = [
  { value: "web", label: "เล่นบนเว็บ", tags: ["เว็บ", "เว็บบนมือถือ"], description: "เกมเวอร์ชันเว็บ การรองรับมือถือขึ้นอยู่กับแต่ละเกม" },
  { value: "mobile", label: "มือถือ", tags: ["Android", "iOS", "เว็บบนมือถือ"], description: "เล่นบนมือถือผ่านแอปหรือเว็บที่รองรับ ดูรายละเอียดของแต่ละเกม" },
  { value: "pc", label: "PC", tags: ["PC", "macOS", "Linux"], description: "เกมที่รองรับคอมพิวเตอร์ ดูระบบและวิธีเล่นในรายละเอียด" },
] as const;

export type GamePlatform = typeof platformGroups[number]["value"];
export function normalizeGamePlatform(value: string): GamePlatform | "" {
  return platformGroups.some(group => group.value === value) ? value as GamePlatform : "";
}
export function matchesGamePlatform(tags: readonly string[], platform: string) {
  const group = platformGroups.find(group => group.value === platform);
  return !group || group.tags.some(tag => tags.includes(tag));
}
export function gamePlatformBadges(tags: readonly string[]) {
  return platformGroups.filter(group => matchesGamePlatform(tags, group.value));
}
