"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, Shuffle } from "lucide-react";
import type { Entry } from "@/lib/model";

const steps = [
  { title: "คิดไอเดีย", description: "เริ่มจากสิ่งที่อยากให้ผู้เล่นได้ลอง แล้วใช้ AI ช่วยต่อยอด", points: ["สรุปไอเดียให้จบในหนึ่งประโยค", "เริ่มจากเกมเล็กที่เล่นจบได้ใน 5–10 นาที", "เลือกว่าจะใช้ AI ช่วยสร้างเกม หรือให้ AI เป็นส่วนหนึ่งของการเล่น"], categories: ["ไอเดียและออกแบบ"] },
  { title: "วางแผนให้เล็กพอทำเสร็จ", description: "เขียนแผนหน้าเดียวก่อนลงมือ", points: ["กำหนดว่าผู้เล่นทำอะไรซ้ำ ๆ และอะไรทำให้สนุก", "เลือกแพลตฟอร์มและเอนจินที่เหมาะกับเกม", "ลิสต์ฉาก ตัวละคร ภาพ และเสียงที่ต้องใช้ในต้นแบบ"], categories: ["เอนจินเกม"] },
  { title: "เขียนโค้ด", description: "ใช้ AI ช่วยทีละฟีเจอร์ แล้วเล่นทดสอบทุกครั้ง", points: ["เริ่มจากต้นแบบที่ขยับตัวละครและเล่นวนได้ก่อน", "บอกเป้าหมาย กติกา และเงื่อนไขให้ AI ชัดเจน", "บันทึกเวอร์ชันที่เล่นได้ ก่อนเพิ่มระบบใหม่"], categories: ["เขียนโค้ด"] },
  { title: "สร้างภาพและเสียง", description: "คุมสไตล์ให้เหมือนกันทั้งเกม", points: ["ใช้ภาพอ้างอิงชุดเดียวกันสำหรับตัวละครและฉาก", "เพิ่มแอนิเมชัน เสียงเอฟเฟกต์ และเพลงให้เข้ากับการเล่น", "ตรวจสิทธิ์ใช้งานของภาพ โมเดล และเสียงก่อนนำไปใช้"], categories: ["ภาพและเสียง", "ภาพและอาร์ต", "โมเดล 3D", "เสียงและเพลง"] },
  { title: "ใส่ AI ในเกม", description: "ข้ามขั้นนี้ได้ ถ้าใช้ AI แค่ตอนสร้าง", points: ["เลือกหน้าที่ให้ AI เช่น บทสนทนาตัวละครหรือเนื้อเรื่อง", "กำหนดขอบเขตคำตอบ และเตรียมทางเลือกเมื่อ AI ไม่ตอบ", "เก็บ API key ที่ฝั่งเซิร์ฟเวอร์ และกำหนดงบการเรียกใช้งาน"], categories: ["AI ในเกม"] },
  { title: "ทดสอบและปรับปรุง", description: "ให้คนอื่นลองเล่น แล้วแก้จุดที่ทำให้ติดขัด", points: ["ดูว่าคนเล่นเข้าใจเป้าหมายและปุ่มควบคุมหรือไม่", "ทดสอบตั้งแต่เริ่มจนจบ รวมถึงการแพ้และเริ่มใหม่", "แก้ปัญหาที่กระทบการเล่นก่อนเพิ่มฟีเจอร์"], categories: ["ทดสอบเกม"] },
];

const ideas = [
  "เกมสืบสวนที่ผู้ต้องสงสัยแต่ละคนมีความลับ ในเมืองที่ทุกคนพูดเป็นกลอน",
  "เกมปลูกสวนบนดาวเล็ก ๆ ที่สภาพอากาศเปลี่ยนตามเรื่องที่ผู้เล่นเล่า",
  "เกมร้านกาแฟที่ลูกค้า AI จำบทสนทนาและคำสั่งซื้อครั้งก่อนได้",
  "เกมปริศนาบนสถานีอวกาศ ที่ต้องโน้มน้าวหุ่นยนต์ให้ช่วยหาทางกลับบ้าน",
];

export function ToolsGuide({ entries }: { entries: Entry[] }) {
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const prompt = `ช่วยต่อยอดไอเดียเกมนี้: “${ideas[ideaIndex]}” เสนอวงจรการเล่นหลัก สิ่งที่ AI ช่วยทำ และขอบเขตต้นแบบที่ทำเสร็จได้ใน 1 สัปดาห์`;
  async function copyPrompt() {
    try { await navigator.clipboard.writeText(prompt); setCopyStatus("คัดลอกแล้ว นำไปวางใน AI ที่คุณใช้ได้เลย"); }
    catch { setCopyStatus("คัดลอกอัตโนมัติไม่ได้ เลือกข้อความด้านล่างแล้วคัดลอกได้เลย"); }
  }
  return <section className="tools-guide" aria-label="ขั้นตอนสร้างเกมด้วย AI">
    {steps.map((step, index) => <article className="tools-guide-step" key={step.title}>
      <span className="tools-step-number" aria-hidden="true">{index + 1}</span>
      <div>
        <h2>{step.title}</h2><p>{step.description}</p>
        <ul>{step.points.map(point => <li key={point}>{point}</li>)}</ul>
        {index === 0 && <div className="tools-idea">
          <span className="tools-idea-label">สุ่มไอเดียตั้งต้น</span>
          <p className="tools-idea-title" aria-live="polite">{ideas[ideaIndex]}</p>
          <div className="tools-idea-actions">
            <button type="button" className="button secondary" onClick={() => { setIdeaIndex(i => (i + 1 + Math.floor(Math.random() * (ideas.length - 1))) % ideas.length); setCopyStatus(""); }}><Shuffle size={16} />สุ่มใหม่</button>
            <button type="button" className="button secondary" onClick={copyPrompt}><Copy size={16} />คัดลอก prompt ไปถาม AI</button>
          </div>
          <textarea aria-label="Prompt ไอเดียเกม" readOnly value={prompt} rows={3} />
          <p role="status" className="tools-copy-status">{copyStatus}</p>
        </div>}
        <div className="tools-step-links">{entries.filter(entry => step.categories.includes(entry.category)).map(entry => <Link key={entry.id} href={`/tools#tool-${entry.id}`}>{entry.title}</Link>)}</div>
      </div>
    </article>)}
  </section>;
}

export function ToolDirectoryCard({ entry }: { entry: Entry }) {
  return <article className="tool-directory-card" id={`tool-${entry.id}`}>
    <div className="tool-directory-card-heading"><h3>{entry.title}</h3><span>{entry.category}</span></div>
    <p>{entry.description}</p>
    <a href={entry.url} target="_blank" rel="noopener noreferrer" aria-label={`เปิดเว็บ ${entry.title} (แท็บใหม่)`}>เปิดเว็บ <ArrowUpRight size={15} aria-hidden="true" /></a>
  </article>;
}
