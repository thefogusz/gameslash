"use client";
import { useEffect, useId, useState } from "react";
import { ConsoleSelect } from "./console-select";
import { baseGameTags, gameTagSchema, gameStatusTags, isGameStatus, tagKey, type GameTag } from "@/lib/game-tags";

export function GameTagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const [tags, setTags] = useState<GameTag[]>(baseGameTags);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tags", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      setTags(gameTagSchema.array().parse((await response.json()).tags));
    }).catch(() => { if (!controller.signal.aborted) setError("โหลดแท็กเพิ่มเติมไม่สำเร็จ แสดงคลังพื้นฐานอยู่ กรุณาลองเปิดฟอร์มใหม่"); });
    return () => controller.abort();
  }, []);
  const matches = tags.filter(tag => !isGameStatus(tag.name) && !value.includes(tag.name) && tagKey(`${tag.name} ${tag.thai}`).includes(tagKey(query)));
  return <fieldset className="game-tag-picker">
    <legend>แท็กเกม <span className="field-hint">{value.length}/20</span></legend>
    <p id={`${id}-hint`}>เลือกเฉพาะสิ่งที่ตรงกับเกม ค้นหาได้ทั้งไทยและอังกฤษ</p>
    <div className="console-field">สถานะเกม
    <ConsoleSelect label="สถานะเกม" value={value.find(isGameStatus) || ""} onChange={status => onChange([...value.filter(t => !isGameStatus(t)), ...(status ? [status] : [])])}>
      <option value="">ยังไม่ยืนยันสถานะ</option>
      {gameStatusTags.map(tag => <option key={tag.name} value={tag.name} disabled={value.length >= 20 && !value.some(isGameStatus)}>{tag.name} · {tag.thai}</option>)}
    </ConsoleSelect></div>
    <p className="field-hint">เลือกตามประกาศล่าสุดของผู้สร้าง ใส่ลิงก์และวันที่ตรวจในรายละเอียด สถานะนี้แยกจากสถานะเผยแพร่บทความ</p>
    <div className="tag-chips">{value.map(name => <button type="button" key={name} onClick={() => onChange(value.filter(t => t !== name))} aria-label={`นำแท็ก ${name} ออก`}>{name}<span aria-hidden="true">×</span></button>)}</div>
    <label htmlFor={id}>ค้นหาแท็ก</label>
    <input id={id} value={query} onChange={e => setQuery(e.target.value)} aria-describedby={`${id}-hint`} placeholder="เช่น ผจญภัย, Roguelike, ผู้เล่นคนเดียว" autoComplete="off" />
    <div className="tag-picker-results" aria-label="แท็กที่เลือกได้">{matches.slice(0, 24).map(tag => <button type="button" key={tag.id} disabled={value.length >= 20} onClick={() => onChange([...value, tag.name])}><strong>{tag.thai}</strong>{tag.thai !== tag.name && <small>{tag.name}</small>}</button>)}</div>
    <p role="status">{matches.length ? `พบ ${matches.length} แท็ก${matches.length > 24 ? " · แสดง 24 แท็กแรก พิมพ์เพื่อค้นหาเพิ่ม" : ""}` : "ไม่พบแท็กที่ตรงกัน เสนอแท็กใหม่ด้านล่างได้"}</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </fieldset>;
}
