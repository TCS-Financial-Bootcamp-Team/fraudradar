import { z } from "zod";
import { jobSchema } from "@/features/jobs/schemas/jobs";

// Espelha api/schemas/models.py e JobResponse de api/schemas/datasets.py.
export const modelMetricsSchema = z.object({
  pr_auc: z.number().nullable(),
  recall_at_fpr: z.number().nullable(),
  f1: z.number().nullable(),
  queue_recall: z.number().nullable(),
  queue_precision: z.number().nullable(),
  innocents_per_week: z.number().nullable(),
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
});

export const modelsSchema = z.object({
  dataset: z.string(),
  active_version: z.string().nullable(),
  versions: z.array(modelVersionSchema),
  can_train: z.boolean(),
  train_blocked_reason: z.string().nullable(),
  training_job: jobSchema.nullable(),
});

export type ModelMetrics = z.infer<typeof modelMetricsSchema>;
export type ModelVersion = z.infer<typeof modelVersionSchema>;
export type Models = z.infer<typeof modelsSchema>;
