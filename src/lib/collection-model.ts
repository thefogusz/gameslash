// Legacy collection schemas retain stored history after the Console integration was removed.
import { z } from "zod";
export const facebookGroupUrl = z.string().trim().max(300).regex(/^https:\/\/(?:www\.)?facebook\.com\/groups\/[a-zA-Z0-9.]+\/?$/, "ใส่ลิงก์กลุ่ม Facebook สาธารณะ เช่น https://www.facebook.com/groups/123");
export const sourceSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(2).max(80), url: facebookGroupUrl });
export const candidateSchema = z.object({ url: z.string().url().max(2000), text: z.string().max(3000), author: z.string().max(100), time: z.string().max(40) });
export const jobSchema = z.object({
  id: z.string().uuid(), source: sourceSchema, createdAt: z.iso.datetime(),
  limit: z.union([z.literal(10), z.literal(100), z.literal(950)]).default(10),
  status: z.enum(["starting", "unknown", "READY", "RUNNING", "SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTING", "ABORTED"]),
  runId: z.string().regex(/^[a-zA-Z0-9]+$/).max(100).optional(),
  cost: z.number().nonnegative().optional(), message: z.string().max(400).default(""),
  candidates: z.array(candidateSchema).max(950).default([]),
});
