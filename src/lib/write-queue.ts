import { z } from "zod";

export const operationContextSchema = z.object({ agentId: z.uuid(), requestId: z.string().min(8).max(100), tool: z.string().regex(/^[a-z_]{1,60}$/), inputHash: z.string().regex(/^[a-f0-9]{64}$/) });
export type OperationContext = z.infer<typeof operationContextSchema>;
export const queueRequestSchema = z.object({ ticket: z.uuid(), action: z.enum(["enqueue", "claim", "cancel", "complete"]), operation: operationContextSchema.optional(), outcome: z.enum(["succeeded", "failed", "unknown"]).optional(), result: z.string().max(2000).optional() });
export const queueRecordSchema = z.object({ ticket: z.uuid(), status: z.enum(["queued", "running", "succeeded", "failed", "unknown"]), result: z.string().nullable(), updatedAt: z.number() });
export type QueueRecord = z.infer<typeof queueRecordSchema>;
