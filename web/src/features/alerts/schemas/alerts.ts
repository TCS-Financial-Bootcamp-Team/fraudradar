import { z } from "zod";

export const statusSchema = z.enum([
  "pending",
  "escalated",
  "archived",
  "reported",
]);
export const alertSchema = z.object({
  id: z.string(),
  account: z.string(),
  week: z.iso.date(),
  country: z.string(),
  typology: z.string(),
  score: z.number().min(0).max(100),
  amount: z.number().nonnegative(),
  transaction_count: z.number().int().nonnegative(),
  status: statusSchema,
  queue_position: z.number().int().positive(),
});
export const queueSchema = z.object({
  items: z.array(alertSchema),
  total: z.number().int().nonnegative(),
  countries: z.array(z.string()),
});
export const assessmentSchema = z.object({
  content: z.string(),
  sources: z.array(z.object({ title: z.string(), excerpt: z.string() })),
});
export const alertDetailSchema = alertSchema.extend({
  contributions: z.array(
    z.object({ name: z.string(), value: z.number().min(0).max(100) }),
  ),
  rules: z.array(z.object({ code: z.string(), description: z.string() })),
  movements: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      sender: z.string(),
      receiver: z.string(),
      amount: z.number(),
      currency: z.string(),
      payment_type: z.string(),
    }),
  ),
  assessment: assessmentSchema.nullable(),
});
export const graphSchema = z.object({
  nodes: z.array(
    z.object({ id: z.string(), label: z.string(), central: z.boolean() }),
  ),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      amount: z.number(),
    }),
  ),
});
export const decisionSchema = z.object({
  decision: z.enum(["archive", "escalate", "report"]),
  justification: z
    .string()
    .trim()
    .min(10, "Descreva a justificativa com pelo menos 10 caracteres.")
    .max(4000),
});
export const reportSchema = z.object({
  alert_id: z.string(),
  content: z.string(),
  status: z.enum(["draft", "approved"]),
  updated_at: z.string(),
});
export const approvalSchema = z.object({
  content: z
    .string()
    .trim()
    .min(30, "Revise o rascunho: mínimo de 30 caracteres.")
    .max(20000),
});
export const replaySchema = z.object({
  week: z.iso.date(),
  alerts_generated: z.number().int().nonnegative(),
});
export const seriesSchema = z.object({
  name: z.string(),
  value: z.number().nonnegative(),
});
export const monitoringSchema = z.object({
  week: z.iso.date(),
  indicators: z.object({
    alerts: z.number(),
    reviewed: z.number(),
    reported: z.number(),
    alert_rate: z.number().min(0).max(1),
    flagged_amount: z.number(),
    recall: z.number().min(0).max(1),
    typology_accuracy: z.number().min(0).max(1),
  }),
  weeks: z.array(seriesSchema),
  typologies: z.array(seriesSchema),
  countries: z.array(seriesSchema),
  country_rates: z.array(seriesSchema),
  payment_type_rates: z.array(seriesSchema),
});
export type AlertStatus = z.infer<typeof statusSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type AlertQueue = z.infer<typeof queueSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type AlertDetail = z.infer<typeof alertDetailSchema>;
export type Graph = z.infer<typeof graphSchema>;
export type DecisionRequest = z.infer<typeof decisionSchema>;
export type Report = z.infer<typeof reportSchema>;
export type ApprovalRequest = z.infer<typeof approvalSchema>;
export type Replay = z.infer<typeof replaySchema>;
export type Monitoring = z.infer<typeof monitoringSchema>;
export type Series = z.infer<typeof seriesSchema>;
export type AlertFilters = {
  week: string;
  status?: string;
  country?: string;
  page?: number;
};
