import { z } from "zod";

export const HISTORY_CONTENT_LIMIT = 8000;
export const PAGE_STATE_MAX_FILTERS = 20;
export const PAGE_STATE_MAX_FILTER_KEY_LENGTH = 40;
export const PAGE_STATE_MAX_FILTER_STR_LENGTH = 100;
export const PAGE_STATE_MAX_ALERT_IDS = 100;
export const MAX_CHAT_LINKS = 5;
export const MAX_CHAT_LINK_LABEL_LENGTH = 60;

export const chatKindSchema = z.enum([
  "small_talk",
  "legal",
  "domain",
  "decision",
  "system",
  "out_of_scope",
]);

export const sourceSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
});

export const chatLinkSchema = z.object({
  href: z.string().min(1),
  label: z.string().trim().min(1).max(MAX_CHAT_LINK_LABEL_LENGTH),
});

const pageFilterValueSchema = z.union([
  z.string().max(PAGE_STATE_MAX_FILTER_STR_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const pageStateSchema = z.object({
  filters: z
    .record(
      z.string().min(1).max(PAGE_STATE_MAX_FILTER_KEY_LENGTH),
      pageFilterValueSchema,
    )
    .refine((obj) => Object.keys(obj).length <= PAGE_STATE_MAX_FILTERS, {
      message: "Too many filter keys",
    })
    .default({}),
  visible_alert_ids: z
    .array(z.number().int().positive())
    .max(PAGE_STATE_MAX_ALERT_IDS)
    .default([]),
  page: z.number().int().positive().nullable().optional(),
  total: z.number().int().nonnegative().nullable().optional(),
});

export const aiModelOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export const aiModelsResponseSchema = z.object({
  default: z.string().min(1),
  models: z.array(aiModelOptionSchema).min(1),
});

// A mensagem exibida pode incluir resposta formatada, classificação, fontes, links e modelo.
export const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  sources: z.array(sourceSchema).optional(),
  kind: chatKindSchema.optional(),
  links: z.array(chatLinkSchema).optional(),
  model: z.string().nullable().optional(),
  grounded: z.boolean().nullable().optional(),
});

const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(HISTORY_CONTENT_LIMIT),
});

export const chatContextSchema = z.object({
  page: z.string(),
  week: z.string(),
  alert_id: z.string().optional(),
  path: z
    .string()
    .max(200)
    .refine((val) => val.startsWith("/"), {
      message: "Path must start with /",
    })
    .nullable()
    .optional(),
  page_state: pageStateSchema.nullable().optional(),
});

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: chatContextSchema,
  history: z.array(historyMessageSchema).max(20),
  model: z.string().min(1).nullable().optional(),
  conversation_id: z.number().int().positive().nullable().optional(),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(sourceSchema).default([]),
  kind: chatKindSchema.optional(),
  links: z.array(chatLinkSchema).max(MAX_CHAT_LINKS).default([]),
  model: z.string().nullable().optional(),
  conversation_id: z.number().int().positive().nullable().optional(),
  grounded: z.boolean().nullable().optional(),
});

export const conversationSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  updated_at: z.string(),
  message_count: z.number().int().nonnegative(),
});

export const conversationListSchema = z.array(conversationSummarySchema);

export const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  kind: chatKindSchema.nullable().optional(),
  sources: z.array(sourceSchema).default([]),
  links: z.array(chatLinkSchema).default([]),
  model: z.string().nullable().optional(),
  created_at: z.string().optional(),
  grounded: z.boolean().nullable().optional(),
});

export const conversationDetailSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  updated_at: z.string(),
  messages: z.array(conversationMessageSchema),
});

export type ChatKind = z.infer<typeof chatKindSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type ChatLink = z.infer<typeof chatLinkSchema>;
export type PageState = z.infer<typeof pageStateSchema>;
export type AiModelOption = z.infer<typeof aiModelOptionSchema>;
export type AiModelsResponse = z.infer<typeof aiModelsResponseSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
