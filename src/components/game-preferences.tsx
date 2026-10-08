"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "lucide-react";
import { likesStorageKey, readLikedIds } from "@/lib/game-preferences";

const PreferencesContext = createContext<{
  likedIds: string[]; ready: boolean; error: string; notice: string;
  toggle: (id: string, title: string) => void;
} | null>(null);

export function GamePreferencesProvider({ children }: { children: ReactNode }) {
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef<string[]>([]);
  useEffect(() => {
    try { current.current = readLikedIds(localStorage.getItem(likesStorageKey)); setLikedIds(current.current); }
    catch { setError("เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล ถูกใจจะจำไว้ได้เฉพาะหน้านี้"); }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === likesStorageKey || event.key === null) {
        current.current = readLikedIds(event.newValue);
        setLikedIds(current.current);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function toggle(id: string, title: string) {
    const wasLiked = current.current.includes(id);
    if (!wasLiked && current.current.length >= 3000) {
      setError("เก็บถูกใจได้สูงสุด 3,000 เกม กรุณานำบางเกมออกก่อน");
      return;
    }
    const next = wasLiked ? current.current.filter(value => value !== id) : [...current.current, id];
    current.current = next;
    setLikedIds(next);
    try {
      localStorage.setItem(likesStorageKey, JSON.stringify({ version: 1, likedIds: next }));
      setError("");
      setNotice(wasLiked ? `นำ ${title} ออกจากถูกใจแล้ว` : `ถูกใจ ${title} แล้ว บันทึกในเบราว์เซอร์นี้`);
    } catch {
      setError("บันทึกลงเครื่องไม่ได้ ถูกใจครั้งนี้จะจำไว้เฉพาะหน้านี้");
      setNotice("บันทึกถูกใจลงเครื่องไม่ได้");
    }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return <PreferencesContext.Provider value={{ likedIds, ready, error, notice, toggle }}>
    {children}
    <div className="likes-notice" role="status" aria-live="polite">{notice || error}</div>
  </PreferencesContext.Provider>;
}

export function useGamePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("GamePreferencesProvider is required");
  return value;
}

export function LikeButton({ id, title, compact = false }: { id: string; title: string; compact?: boolean }) {
  const { likedIds, ready, toggle } = useGamePreferences();
  const liked = likedIds.includes(id);
  return <button type="button" className={`game-like${compact ? " compact" : ""}`} disabled={!ready}
    aria-pressed={liked} aria-label={`${liked ? "เลิกถูกใจ" : "ถูกใจ"} ${title}`}
    title={liked ? "นำออกจากถูกใจ" : "เก็บเกมไว้ในถูกใจ"} onClick={() => toggle(id, title)}>
    <Heart size={20} strokeWidth={1.5} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
    {!compact && <span>{liked ? "ถูกใจแล้ว" : "ถูกใจ"}</span>}
  </button>;
}
