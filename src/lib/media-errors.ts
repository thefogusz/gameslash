export class ImageUploadError extends Error {
  constructor(cause: unknown) {
    super("อัปโหลดรูปสะดุด กรุณาเว้นช่วงแล้วส่งรูปเดิมอีกครั้ง", { cause });
    this.name = "ImageUploadError";
  }
}
