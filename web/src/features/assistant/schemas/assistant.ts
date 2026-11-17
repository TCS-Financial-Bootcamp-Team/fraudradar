import { z } from "zod";

export const HISTORY_CONTENT_LIMIT = 8000;

export const chatKindSchema = z.enum([
  "small_talk",
  "legal",
  "domain",
  "out_of_scope",
]);

export const sourceSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
});

// A mensagem exibida pode incluir resposta formatada, classificação e fontes associadas.
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z.array(sourceSchema).optional(),
  kind: chatKindSchema.optional(),
});

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
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
  sources: z.array(sourceSchema).default([]),
  kind: chatKindSchema.optional(),
});

export type ChatKind = z.infer<typeof chatKindSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
