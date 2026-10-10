import { ZodError } from "zod";
import { ConflictError } from "./postgres-store";
import { D1RequestError } from "./d1-store";
import { ImageUploadError, ImageUploadLimitError } from "./media-errors";

export function mcpError(error: unknown) {
  if (error instanceof ImageUploadLimitError) return {
    code: "IMAGE_UPLOAD_LIMIT", message: error.message, scope: error.scope, limit: error.limit,
    resetAt: error.resetAt, retryAfterSeconds: error.retryAfterSeconds, retryable: true, outcomeUnknown: false,
  };
  if (error instanceof Error && error.message.startsWith("QA_REQUIRED")) return {
    code: "QA_REQUIRED", message: error.message, retryable: false, outcomeUnknown: false,
  };
  if (error instanceof ImageUploadError) return {
    code: "SERVICE_UNAVAILABLE", message: error.message, retryable: true, retryAfterSeconds: 5, outcomeUnknown: false,
  };
  if (error instanceof D1RequestError) {
    if (error.resetAt) return {
      code: "QUOTA_EXHAUSTED", message: "โควต้าฐานข้อมูลวันนี้หมด กรุณารอเวลารีเซ็ตก่อนทำงานต่อ",
      retryable: false, resetAt: error.resetAt, retryAfterSeconds: error.retryAfterSeconds, outcomeUnknown: false,
    };
    if (error.outcomeUnknown) return {
      code: "OUTCOME_UNKNOWN", message: "ยังยืนยันผลบันทึกไม่ได้ กรุณาอ่านตรวจผลก่อนส่งคำขอเขียนซ้ำ",
      retryable: false, outcomeUnknown: true,
    };
    const retryable = error.status === 429 || error.status >= 500;
    return {
      code: retryable ? "SERVICE_UNAVAILABLE" : "STORAGE_ERROR",
      message: retryable ? "บริการข้อมูลไม่พร้อม กรุณาเว้นช่วงก่อนลองใหม่" : "การเชื่อมต่อคลังข้อมูลมีปัญหา กรุณาแจ้งผู้ดูแล",
      retryable,
      ...(retryable ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
      outcomeUnknown: error.outcomeUnknown,
    };
  }
  return {
    code: error instanceof ConflictError ? "CONFLICT" : error instanceof ZodError ? "INVALID_INPUT" : "REQUEST_FAILED",
    message: error instanceof ZodError ? "ข้อมูลไม่ถูกต้อง กรุณาตรวจรูปแบบรายการ" :
      error instanceof Error && /[ก-๙]/.test(error.message) ? error.message : "ดำเนินการไม่สำเร็จ กรุณาแจ้งผู้ดูแล",
    retryable: false,
    outcomeUnknown: false,
  };
}
