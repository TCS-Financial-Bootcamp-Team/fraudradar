import { z } from "zod";

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
  version: z.string().regex(/^lightgbm_v[0-9]+$/),
  source: z.enum(["official", "dataset"]),
  created_at: z.string().nullable(),
  trees: z.number().int().nullable(),
  history_start: z.string().nullable(),
  train_end: z.string().nullable(),
  metrics: modelMetricsSchema,
  active: z.boolean(),
});

export const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(["import", "process", "train"]),
  dataset: z.string(),
  status: z.enum(["queued", "running", "done", "failed"]),
  progress: z.number().int().min(0).max(100),
  message: z.string().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
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
export type Job = z.infer<typeof jobSchema>;
export type Models = z.infer<typeof modelsSchema>;

export const jobIsOpen = (job: Pick<Job, "status">) =>
  job.status === "queued" || job.status === "running";
