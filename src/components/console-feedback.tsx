import { Check, CircleAlert, Loader2, X } from "lucide-react";

export function ConsoleFeedback({ pending, error, notice, dismiss }: {
  pending: string;
  error: string;
  notice: string;
  dismiss: () => void;
}) {
  const message = pending || error || notice;
  if (!message) return null;
  const state = pending ? "pending" : error ? "error" : "success";
  return (
    <div className="console-toast" data-state={state} role={state === "error" ? "alert" : "status"} aria-atomic="true">
      {state === "pending" ? <Loader2 className="spin" size={20} /> : state === "error" ? <CircleAlert size={20} /> : <Check size={20} />}
      <div><strong>{state === "pending" ? "กรุณารอสักครู่" : state === "error" ? "ดำเนินการไม่สำเร็จ" : "สำเร็จ"}</strong><p>{message}</p></div>
      {!pending && <button type="button" className="icon-button" aria-label="ปิดข้อความแจ้งเตือน" onClick={dismiss}><X size={18} /></button>}
    </div>
  );
}
