"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "lucide-react";
import { likesStorageKey, readLikedIds, requestLikes } from "@/lib/game-preferences";

const PreferencesContext = createContext<{
  likedIds: string[]; ready: boolean; busy: boolean; error: string; notice: string;
  toggle: (id: string, title: string) => void;
} | null>(null);

export function GamePreferencesProvider({ children }: { children: ReactNode }) {
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef<string[]>([]);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  function accept(ids: string[]) {
    current.current = ids;
    setLikedIds(ids);
    try { localStorage.setItem(likesStorageKey, JSON.stringify({ version: 1, likedIds: ids, synced: true })); }
    catch { /* Server storage remains available without local storage. */ }
  }
  async function load(signal?: AbortSignal) {
    setError("");
    try {
      let raw: string | null = null;
      try { raw = localStorage.getItem(likesStorageKey); } catch { /* Cookies suffice. */ }
      if (signal?.aborted) return;
      current.current = readLikedIds(raw);
      setLikedIds(current.current);
      let ids = await requestLikes(undefined, signal);
      const legacy = readLikedIds(raw);
      if (legacy.length && JSON.parse(raw!).synced !== true)
        ids = await requestLikes({ importIds: legacy }, signal);
      if (signal?.aborted) return;
      accept(ids);
      setReady(true);
    } catch (error) {
      if (!signal?.aborted) setError((error as Error).message);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const sync = (event: StorageEvent) => {
      if (event.key === likesStorageKey && event.newValue) {
        current.current = readLikedIds(event.newValue);
        setLikedIds(current.current);
      }
    };
    window.addEventListener("storage", sync);
    return () => { controller.abort(); window.removeEventListener("storage", sync); };
  }, []);
  async function toggle(id: string, title: string) {
    if (saving.current || !ready) return;
    const wasLiked = current.current.includes(id);
    if (!wasLiked && current.current.length >= 3000) {
      setError("เก็บถูกใจได้สูงสุด 3,000 เกม กรุณานำบางเกมออกก่อน");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const previous = current.current;
    setLikedIds(wasLiked ? previous.filter(likedId => likedId !== id) : [...previous, id]);
    try {
      accept(await requestLikes({ id, liked: !wasLiked }));
      setNotice(wasLiked ? `นำ ${title} ออกจากถูกใจแล้ว` : `ถูกใจ ${title} แล้ว`);
    } catch (error) { setLikedIds(current.current); setError((error as Error).message); }
    finally { saving.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return <PreferencesContext.Provider value={{ likedIds, ready, busy, error, notice, toggle }}>
    {children}
    <div className="likes-notice" role="status" aria-live="polite">{notice || error}{!ready && error && <button type="button" className="text-link" onClick={() => void load()}>ลองอีกครั้ง</button>}</div>
  </PreferencesContext.Provider>;
}

export function useGamePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("GamePreferencesProvider is required");
  return value;
}

export function LikeButton({ id, title, compact = false }: { id: string; title: string; compact?: boolean }) {
  const { likedIds, ready, busy, toggle } = useGamePreferences();
  const liked = likedIds.includes(id);
  return <button type="button" className={`game-like${compact ? " compact" : ""}`} disabled={!ready || busy}
    aria-pressed={liked} aria-label={`${liked ? "เลิกถูกใจ" : "ถูกใจ"} ${title}`}
    title={liked ? "นำออกจากถูกใจ" : "เก็บเกมไว้ในถูกใจ"} onClick={() => toggle(id, title)}>
    <Heart size={20} strokeWidth={1.5} fill={liked ? "currentColor" : "none"} aria-hidden="true" />
    {!compact && <span>{liked ? "ถูกใจแล้ว" : "ถูกใจ"}</span>}
  </button>;
}
