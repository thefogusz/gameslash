import { ZodError } from "zod";
import { ConflictError } from "./postgres-store";
import { D1RequestError } from "./d1-store";

export function mcpError(error: unknown) {
  if (error instanceof D1RequestError) {
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
