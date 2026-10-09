"use client";
import Image from "next/image";
import { useState } from "react";
import { Sprout, Gamepad2 } from "lucide-react";
import type { Entry } from "@/lib/model";
export function Cover({
  entry,
  priority = false,
  sizes = "(max-width: 700px) 90vw, 40vw",
}: {
  entry: Entry;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (entry.image && !failed)
    return (
      <Image
        fill
        unoptimized
        src={entry.image}
        alt={entry.imageAlt || `ภาพประชาสัมพันธ์ ${entry.title}`}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        onError={() => setFailed(true)}
        className={`cover-image ${entry.id === "ai-dungeon" ? "contain" : ""}`}
      />
    );
  return (
    <div
      className={`cover-fallback art-${entry.id === "infinite-craft" ? "craft" : entry.kind}`}
      aria-hidden="true"
    >
      {entry.id === "infinite-craft" ? (
        <>
          <span className="craft-symbol">∞</span>
          <span className="craft-caption">
            a little curiosity. infinite possibilities.
          </span>
        </>
      ) : entry.kind === "article" ? (
        <>
          <span className="editorial-index">
            {entry.id === "first-small-game" ? "01" : "02"}
            <span>/</span>
          </span>
          <span className="editorial-caption">THE MAKER’S NOTEBOOK</span>
        </>
      ) : entry.id === "ai-town" ? (
        <>
          <Sprout size={56} strokeWidth={1} />
          <span className="fallback-title">a town of possibilities.</span>
        </>
      ) : (
        <>
          <Gamepad2 size={48} strokeWidth={1} />
          <span className="fallback-title">{entry.title}</span>
        </>
      )}
    </div>
  );
}
