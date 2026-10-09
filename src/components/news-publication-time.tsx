import React from "react";
import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });

const thaiDateTime = new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  year: "numeric", month: "short", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function NewsPublicationTime({ publishedAt, className = "" }: {
  publishedAt?: string | null;
  className?: string;
}) {
  // Require an explicit timezone; a timezone-less legacy string is ambiguous.
  if (!publishedAt || !timestamp.safeParse(publishedAt).success) return null;
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) return null;
  const label = `เผยแพร่ ${thaiDateTime.format(date)} น. (เวลาไทย)`;
  return <time className={`news-publication-time ${className}`.trim()} dateTime={date.toISOString()} title={label}>{label}</time>;
}
