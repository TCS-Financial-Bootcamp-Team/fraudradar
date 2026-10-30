import { z } from "zod";
export const HISTORY_CONTENT_LIMIT = 8000;
// A mensagem exibida pode incluir uma resposta longa e os títulos das fontes.
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
const historyMessageSchema = messageSchema.extend({
  content: z.string().min(1).max(HISTORY_CONTENT_LIMIT),
});
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: z.object({
    page: z.string(),
    week: z.string(),
    alert_id: z.string().optional(),
  }),
  history: z.array(historyMessageSchema).max(20),
});
export const chatResponseSchema = z.object({
  answer: z.string(),
  sources: z
    .array(z.object({ title: z.string(), excerpt: z.string() }))
    .default([]),
});
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
