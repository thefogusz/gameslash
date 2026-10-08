"use client";
import { useState } from "react";
import { imageUrl } from "@/lib/article";
export function ImageField({value,onChange,onBusy,label="ภาพ"}:{value:string;onChange:(url:string)=>void;onBusy:(busy:boolean)=>void;label?:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const valid=imageUrl.safeParse(value).success;
  return <div className="image-field">
    <label>{label}<input aria-label={`ลิงก์${label}`} value={value} onChange={e=>onChange(e.target.value)} placeholder="วางลิงก์ HTTPS หรือเลือกไฟล์ด้านล่าง" maxLength={2000}/></label>
    <label className="image-upload">{busy ? "กำลังอัปโหลด…" : `อัปโหลด${label}`}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0]; e.target.value=""; if(!file) return;
      setError(""); if(file.size>2*1024*1024) {setError("เลือกภาพขนาดไม่เกิน 2 MB");return;}
      setBusy(true);onBusy(true);
      try { const response=await fetch("/api/media",{method:"POST",headers:{"Content-Type":file.type},body:file}); const data=await response.json(); if(!response.ok) throw new Error(data.error || "อัปโหลดไม่สำเร็จ"); onChange(imageUrl.parse(data.url)); }
      catch(e) {setError(e instanceof Error?e.message:"อัปโหลดไม่สำเร็จ");}
      finally {setBusy(false);onBusy(false);}
    }}/></label>
    <p className="field-hint">JPG, PNG, WebP ไม่เกิน 2 MB · ใช้ภาพที่มีสิทธิ์เผยแพร่ ภาพที่อัปโหลดเปิดดูได้ผ่านลิงก์</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {valid && <div className="image-field-preview"><img src={value} alt={`ตัวอย่าง${label}`}/><button type="button" className="button" onClick={()=>onChange("")}>เอาภาพออก</button></div>}
  </div>;
}
