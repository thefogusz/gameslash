import { z } from "zod";
import { consumeLimit, type Database } from "./model";

export const feedbackInput = z.object({
  message: z.string().trim().min(3, "กรุณาใส่ข้อความอย่างน้อย 3 ตัวอักษร").max(4000),
  page: z.string().max(1000).regex(/^\/(?!\/)/),
  image: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
});
export function reserveFeedback(db: Database, fingerprint: string) {
  consumeLimit(db, `feedback:${fingerprint}`, 5, 60 * 60 * 1000);
  consumeLimit(db, "feedback:daily", 100, 24 * 60 * 60 * 1000);
  if (db.feedback.length >= 3000) throw new Error("คิวฟีดแบคเต็มชั่วคราว กรุณาลองภายหลัง");
}
