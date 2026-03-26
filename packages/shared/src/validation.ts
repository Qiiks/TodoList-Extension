import { z } from "zod";
import { CONSTANTS } from "./constants";

export const todoSchema = z.object({
  title: z.string().min(1).max(CONSTANTS.MAX_TITLE_LENGTH),
  description: z.string().max(CONSTANTS.MAX_DESC_LENGTH).optional(),
  status: z.enum(["open", "completed"]),
  priority: z.enum(["low", "medium", "high"]),
  labels: z.array(z.string().min(1)).max(CONSTANTS.MAX_LABELS).default([]),
  checklist: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        completed: z.boolean(),
      }),
    )
    .max(CONSTANTS.MAX_CHECKLIST_ITEMS)
    .default([]),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(CONSTANTS.MAX_COMMENT_LENGTH),
});

export const authRegisterSchema = z.object({
  githubToken: z.string().min(1),
  inviteCode: z.string().length(16),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const inviteSchema = z.object({
  maxUses: z.number().int().positive().default(10),
  expiresAt: z.string().datetime().optional(),
});
