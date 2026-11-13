import { z } from "zod";

// Espelha api/schemas/feedback.py. O que uma plataforma real consegue medir sem gabarito: o que
// os analistas confirmaram e o que a amostra de controle achou fora da fila. Percentual sobre
// menos de 20 casos vem com low_sample.
export const rateSchema = z.object({
  value: z.number().min(0).max(1).nullable(),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  low_sample: z.boolean(),
});
export const weeklyRateSchema = rateSchema.extend({
  week: z.iso.date(),
  name: z.string(),
});
// Rótulos do retorno por classe, fonte e origem (também no bloco de retorno de cada versão).
export const labelBreakdownSchema = z.object({
  total: z.number().int().nonnegative(),
  laundering: z.number().int().nonnegative(),
  false_positive: z.number().int().nonnegative(),
  analyst: z.number().int().nonnegative(),
  simulated: z.number().int().nonnegative(),
  model: z.number().int().nonnegative(),
  exploration: z.number().int().nonnegative(),
});
export const feedbackSummarySchema = z.object({
  start: z.iso.date().nullable(),
  end: z.iso.date().nullable(),
  labels: labelBreakdownSchema,
  confirmed_precision: rateSchema,
  weekly_confirmed_precision: z.array(weeklyRateSchema),
  control_sample: z.object({
    sampled: z.number().int().nonnegative(),
    reviewed: z.number().int().nonnegative(),
    found_outside_queue: rateSchema,
  }),
  active_version: z.string().nullable(),
  new_since_active: z.number().int().nonnegative(),
  retrain: z.object({
    can_retrain: z.boolean(),
    reason: z.string().nullable(),
    can_retrain_with_simulated: z.boolean(),
    reason_with_simulated: z.string().nullable(),
  }),
});

export type Rate = z.infer<typeof rateSchema>;
export type WeeklyRate = z.infer<typeof weeklyRateSchema>;
export type LabelBreakdown = z.infer<typeof labelBreakdownSchema>;
export type FeedbackSummary = z.infer<typeof feedbackSummarySchema>;
export type FeedbackRange = { from?: string; to?: string };
