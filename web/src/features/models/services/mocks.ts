import type { Job, Models } from "../schemas/models";

export const modelsMock: Models = {
  dataset: "saml-d",
  active_version: "lightgbm_v1",
  can_train: true,
  train_blocked_reason: null,
  training_job: null,
  versions: [
    {
      version: "lightgbm_v2",
      source: "dataset",
      created_at: "2026-11-11T10:00:00",
      trees: 310,
      history_start: "2022-10-07",
      train_end: "2023-05-21",
      active: false,
      metrics: {
        pr_auc: 0.081,
        recall_at_fpr: 0.274,
        f1: 0.112,
        queue_recall: 0.62,
        queue_precision: 0.071,
        innocents_per_week: 268.4,
      },
    },
    {
      version: "lightgbm_v1",
      source: "official",
      created_at: "2026-10-01T09:00:00",
      trees: 280,
      history_start: "2022-10-07",
      train_end: "2023-05-21",
      active: true,
      metrics: {
        pr_auc: 0.074,
        recall_at_fpr: 0.251,
        f1: 0.104,
        queue_recall: 0.58,
        queue_precision: 0.066,
        innocents_per_week: 280.1,
      },
    },
  ],
};

export const jobMock: Job = {
  id: "1",
  kind: "train",
  dataset: "saml-d",
  status: "done",
  progress: 100,
  message: "Trabalho concluído.",
  created_at: "2026-11-11T10:00:00Z",
  started_at: "2026-11-11T10:00:01Z",
  finished_at: "2026-11-11T10:04:00Z",
};
