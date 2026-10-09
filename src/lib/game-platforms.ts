/** Discovery groups use only explicit editorial tags, never a URL or user agent. */
export const platformGroups = [
  { value: "web", label: "เล่นบนเว็บ", tags: ["เว็บ"], description: "เกมที่ยืนยันว่าเล่นผ่านเบราว์เซอร์ได้ การรองรับมือถือขึ้นอยู่กับแต่ละเกม" },
  { value: "mobile", label: "มือถือ", tags: ["Android", "iOS"], description: "เกมที่ระบุว่ารองรับ Android หรือ iOS ดูวิธีเล่นและระบบที่รองรับในรายละเอียด" },
  { value: "pc", label: "PC", tags: ["PC", "macOS", "Linux"], description: "เกมที่ระบุว่ารองรับ PC, macOS หรือ Linux ดูวิธีเล่นและระบบที่รองรับในรายละเอียด" },
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
