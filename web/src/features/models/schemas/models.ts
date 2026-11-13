import { z } from "zod";
import { v } from "@/i18n/validation";
import { jobSchema } from "@/features/jobs/schemas/jobs";
import { labelBreakdownSchema } from "@/features/feedback/schemas/feedback";

// Espelha api/schemas/models.py e JobResponse de api/schemas/datasets.py.
// Métricas de validação: medidas contra o gabarito no período de teste de cada versão, para
// decidir a promoção. Só aparecem em Configurações > Modelo, nunca nas telas de operação.
export const modelMetricsSchema = z.object({
  pr_auc: z.number().nullable(),
  recall_at_fpr: z.number().nullable(),
  f1: z.number().nullable(),
  queue_recall: z.number().nullable(),
  queue_precision: z.number().nullable(),
  innocents_per_week: z.number().nullable(),
});

export const comparisonMetricsSchema = z.object({
  pr_auc: z.number().nullable(),
  queue_recall: z.number().nullable(),
  queue_precision: z.number().nullable(),
  innocents_per_week: z.number().nullable(),
});

// A versão nova e a ativa (no momento do treino) nas mesmas semanas de teste, e a trava.
export const comparisonSchema = z.object({
  active_version: z.string(),
  period: z.object({
    start: z.iso.date().nullable(),
    end: z.iso.date().nullable(),
    weeks: z.number().int().nonnegative(),
  }),
  candidate: comparisonMetricsSchema,
  active: comparisonMetricsSchema,
  recall_difference: z.number().nullable(),
  tolerance: z.number(),
  gate: z.object({
    passed: z.boolean(),
    reason: z.string().nullable(),
    // Código e parâmetros do motivo: o front traduz por eles e cai em `reason` (português).
    reason_code: z.string().nullish(),
    reason_params: z.record(z.string(), z.unknown()).nullish(),
  }),
});

// O retorno dos analistas que a versão usou no treino.
export const feedbackUsageSchema = z.object({
  used: z.boolean(),
  include_simulated: z.boolean(),
  labels: labelBreakdownSchema.nullable(),
  labels_in_validation: z.number().int().nonnegative(),
  labels_reserved_for_test: z.number().int().nonnegative(),
  transactions_covered: z.number().int().nonnegative(),
  transactions_weighted: z.number().int().nonnegative(),
  transactions_without_truth: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  split: z.enum(["feedback", "official", "proportional"]).nullable(),
});

export const modelVersionSchema = z.object({
  // Oficial: lightgbm_vN. Retreino de um conjunto: <slug>/vN (nunca colide com o oficial).
  version: z.string().regex(/^(lightgbm_v[0-9]+|[a-z0-9-]{1,40}\/v[0-9]+)$/),
  source: z.enum(["official", "dataset"]),
  created_at: z.string().nullable(),
  trees: z.number().int().nullable(),
  history_start: z.string().nullable(),
  train_end: z.string().nullable(),
  metrics: modelMetricsSchema,
  active: z.boolean(),
  comparison: comparisonSchema.nullable(),
  feedback: feedbackUsageSchema.nullable(),
});

const classCountsSchema = z.object({
  laundering: z.number().int().nonnegative(),
  false_positive: z.number().int().nonnegative(),
});

// O retorno de períodos fechados disponível para o próximo treino; reason null = pode.
export const trainingFeedbackSchema = z.object({
  analyst: classCountsSchema,
  simulated: classCountsSchema,
  blocked_reason: z.string().nullable(),
  blocked_reason_code: z.string().nullish(),
  blocked_reason_params: z.record(z.string(), z.unknown()).nullish(),
  blocked_reason_with_simulated: z.string().nullable(),
  blocked_reason_with_simulated_code: z.string().nullish(),
  blocked_reason_with_simulated_params: z.record(z.string(), z.unknown()).nullish(),
});

export const modelsSchema = z.object({
  dataset: z.string(),
  active_version: z.string().nullable(),
  versions: z.array(modelVersionSchema),
  can_train: z.boolean(),
  train_blocked_reason: z.string().nullable(),
  train_blocked_reason_code: z.string().nullish(),
  train_blocked_reason_params: z.record(z.string(), z.unknown()).nullish(),
  training_job: jobSchema.nullable(),
  training_feedback: trainingFeedbackSchema,
});

export const trainRequestSchema = z
  .object({
    use_feedback: z.boolean(),
    include_simulated: z.boolean(),
  })
  .refine((value) => value.use_feedback || !value.include_simulated, {
    message: v("simulatedNeedsFeedback"),
  });

export type ModelMetrics = z.infer<typeof modelMetricsSchema>;
export type ComparisonMetrics = z.infer<typeof comparisonMetricsSchema>;
export type ModelComparison = z.infer<typeof comparisonSchema>;
export type FeedbackUsage = z.infer<typeof feedbackUsageSchema>;
export type ModelVersion = z.infer<typeof modelVersionSchema>;
export type TrainingFeedback = z.infer<typeof trainingFeedbackSchema>;
export type Models = z.infer<typeof modelsSchema>;
export type TrainRequest = z.infer<typeof trainRequestSchema>;
