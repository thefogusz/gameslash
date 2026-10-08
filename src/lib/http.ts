import { ZodError } from "zod";
import { ConflictError } from "./store";
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
      },
      { status: 400 },
    );
  if (error instanceof ConflictError)
    return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof Error && /[ก-๙]/.test(error.message))
    return Response.json({ error: error.message }, { status: 400 });
  console.error(
    "gameslash request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    { error: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง ข้อมูลที่กรอกยังอยู่" },
    { status: 500 },
  );
}
