export const imageUploadLimits = { media: { hourly: 200, daily: 1000 }, feedback: { hourly: 40, daily: 200 } } as const;
export class ImageUploadLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(public scope: "agent_hourly" | "shared_daily", public limit: number, public resetAt: string) {
    super(scope === "shared_daily" ? `โควตาอัปโหลดภาพร่วมเต็ม ${limit} ภาพต่อ 24 ชั่วโมง เตรียมเนื้อหาต่อได้ แล้วส่งภาพเดิมหลัง resetAt` : `โควตาอัปโหลดภาพของบัญชีนี้เต็ม ${limit} ภาพต่อชั่วโมง เตรียมเนื้อหาต่อได้ แล้วส่งภาพเดิมหลัง resetAt`);
    this.name = "ImageUploadLimitError";
    this.retryAfterSeconds = Math.max(5, Math.ceil((Date.parse(resetAt) - Date.now()) / 1000));
  }
}
export class ImageUploadError extends Error {
  constructor(cause: unknown) {
    super("อัปโหลดรูปสะดุด กรุณาเว้นช่วงแล้วส่งรูปเดิมอีกครั้ง", { cause });
    this.name = "ImageUploadError";
  }
}
