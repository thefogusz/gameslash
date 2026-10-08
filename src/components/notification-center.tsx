"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, FileText, X } from "lucide-react";
import { notificationKey, type DraftNotification } from "@/lib/notifications";
const storageKey="gameslash:read-notifications:v1";
export function NotificationCenter({revision,onOpen}:{revision?:number;onOpen:(item:DraftNotification)=>Promise<boolean>}) {
  const [items,setItems]=useState<DraftNotification[]>([]),[total,setTotal]=useState(0);
  const [seen,setSeen]=useState<string[]>([]),[open,setOpen]=useState(false),[error,setError]=useState(""),[opening,setOpening]=useState(false);
  const container=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),observed=useRef<Set<string>|null>(null);
  const [announcement,setAnnouncement]=useState("");
  useEffect(()=>{if(!announcement)return;const timer=window.setTimeout(()=>setAnnouncement(""),10000);return()=>window.clearTimeout(timer);},[announcement]);
  useEffect(()=>{try {const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))setSeen(saved.filter(v=>typeof v==="string").slice(-500));}catch{/* Reading still works when browser storage is unavailable. */}},[]);
  useEffect(()=>{
    let stopped=false,running=false;const controller=new AbortController();
    async function load(){
      if(document.hidden||running)return;running=true;
      try {
        const response=await fetch("/api/notifications",{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error(response.status===401?"เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง":"ตรวจแจ้งเตือนไม่สำเร็จ จะลองใหม่อัตโนมัติ");
        const data=await response.json();if(stopped)return;
        const keys=new Set<string>(data.items.map(notificationKey));
        const added=observed.current ? [...keys].filter(key=>!observed.current!.has(key)).length : 0;
        if(added)setAnnouncement(`มีร่างหรือรายการส่งตรวจอัปเดต ${added} รายการ เปิดดูได้ที่แจ้งเตือน`);
        observed.current=keys;setItems(data.items);setTotal(data.total);setError("");
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:"ตรวจแจ้งเตือนไม่สำเร็จ");}finally{running=false;}
    }
    void load();const timer=window.setInterval(load,30000);document.addEventListener("visibilitychange",load);
    return()=>{stopped=true;controller.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",load);};
  },[revision]);
  useEffect(()=>{
    if(!open)return;
    function outside(e:PointerEvent){if(!container.current?.contains(e.target as Node))setOpen(false);}
    function escape(e:KeyboardEvent){if(e.key==="Escape"){setOpen(false);trigger.current?.focus();}}
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open]);
  function markRead(keys:string[]){const next=[...new Set([...seen,...keys])].slice(-500);setSeen(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Session-only read state is sufficient without local storage. */}}
  const unread=items.filter(item=>!seen.includes(notificationKey(item))).length;
  return <div className="notification-center" ref={container}>
    <button ref={trigger} className="notification-trigger" aria-label={`แจ้งเตือน ${unread} รายการยังไม่อ่าน`} aria-expanded={open} aria-controls="notification-panel" onClick={()=>setOpen(!open)}><Bell size={20}/>{unread>0&&<span>{unread}</span>}{error&&<i aria-label="การเชื่อมต่อขัดข้อง"/>}</button>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {announcement&&!open&&<div className="notification-arrival"><Bell size={19}/><button onClick={()=>setOpen(true)}>{announcement}</button><button className="icon-button" aria-label="ปิดข้อความแจ้งเตือน" onClick={()=>setAnnouncement("")}><X size={16}/></button></div>}
    {open&&<section id="notification-panel" className="notification-panel" aria-label="แจ้งเตือนฉบับร่าง">
      <header><div><h2>แจ้งเตือน</h2><p>ร่างใหม่และรายการที่ส่งตรวจ</p></div><button className="icon-button" aria-label="ปิดแจ้งเตือน" onClick={()=>{setOpen(false);trigger.current?.focus();}}><X size={18}/></button></header>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="notification-list">{items.length?items.map(item=><button key={notificationKey(item)} className={seen.includes(notificationKey(item))?"read":"unread"} disabled={opening} onClick={async()=>{setOpening(true);try{if(await onOpen(item)){markRead([notificationKey(item)]);setOpen(false);}}catch{setError("เปิดรายการไม่สำเร็จ กรุณาลองใหม่");}finally{setOpening(false);}}}><FileText size={19}/><span><small>{item.status==="pending"?"พร้อมให้คุณตรวจ":"ฉบับร่าง"}</small><strong>{item.title}</strong><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("th-TH",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></span><i/></button>):<p className="notification-empty">ยังไม่มีร่างหรือรายการรอตรวจ</p>}</div>
      <footer><button disabled={!unread} onClick={()=>markRead(items.map(notificationKey))}><CheckCheck size={17}/>อ่านทั้งหมดแล้ว</button><small>{total>50?"แสดง 50 รายการล่าสุด · ":""}ตรวจทุก 30 วินาทีขณะเปิดหน้านี้</small></footer>
    </section>}
  </div>;
}
