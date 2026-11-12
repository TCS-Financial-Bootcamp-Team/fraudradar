import type { Models } from "../schemas/models";

// Duas versões novas para mostrar os dois lados da trava de promoção: uma passa e outra fica
// bloqueada. Os números são exemplos, não resultados de treinamento.
export const modelsMock: Models = {
  dataset: "saml-d",
  active_version: "lightgbm_v1",
  can_train: true,
  train_blocked_reason: null,
  training_job: null,
  training_feedback: {
    analyst: { laundering: 12, false_positive: 9 },
    simulated: { laundering: 1591, false_positive: 185 },
    blocked_reason:
      "O retreino com o retorno precisa de pelo menos 50 rótulos dos analistas em períodos fechados; há 21.",
    blocked_reason_with_simulated: null,
  },
  versions: [
    {
      version: "saml-d/v3",
      source: "dataset",
      created_at: "2026-11-12T15:10:00-03:00",
      trees: 296,
      history_start: "2022-10-07",
      train_end: "2023-07-16",
      active: false,
      metrics: {
        pr_auc: 0.902,
        recall_at_fpr: 0.89,
        f1: 0.88,
        queue_recall: 0.953,
        queue_precision: 0.991,
        innocents_per_week: 2.1,
      },
      comparison: {
        active_version: "lightgbm_v1",
        period: { start: "2023-07-17", end: "2023-08-21", weeks: 6 },
        candidate: {
          pr_auc: 0.902,
          queue_recall: 0.953,
          queue_precision: 0.991,
          innocents_per_week: 2.1,
        },
        active: {
          pr_auc: 0.896,
          queue_recall: 0.948,
          queue_precision: 0.99,
          innocents_per_week: 2.3,
        },
        recall_difference: 0.005,
        tolerance: 0.01,
        gate: {
          passed: true,
          reason:
            "Acha 95,3% das contas lavadoras na fila, contra 94,8% da versão ativa (lightgbm_v1) no mesmo período de teste.",
        },
      },
      feedback: {
        used: true,
        include_simulated: true,
        labels: {
          total: 902,
          laundering: 781,
          false_positive: 121,
          analyst: 12,
          simulated: 890,
          model: 902,
          exploration: 0,
        },
        labels_in_validation: 874,
        labels_reserved_for_test: 0,
        transactions_covered: 7340,
        transactions_weighted: 6915,
        transactions_without_truth: 0,
        conflicts: 425,
        split: "feedback",
      },
    },
    {
      version: "saml-d/v2",
      source: "dataset",
      created_at: "2026-11-11T10:00:00-03:00",
      trees: 310,
      history_start: "2022-10-07",
      train_end: "2023-05-21",
      active: false,
      metrics: {
        pr_auc: 0.871,
        recall_at_fpr: 0.85,
        f1: 0.86,
        queue_recall: 0.921,
        queue_precision: 0.985,
        innocents_per_week: 3.4,
      },
      comparison: {
        active_version: "lightgbm_v1",
        period: { start: "2023-05-22", end: "2023-08-21", weeks: 14 },
        candidate: {
          pr_auc: 0.871,
          queue_recall: 0.921,
          queue_precision: 0.985,
          innocents_per_week: 3.4,
        },
        active: {
          pr_auc: 0.896,
          queue_recall: 0.951,
          queue_precision: 0.99,
          innocents_per_week: 2.2,
        },
        recall_difference: -0.03,
        tolerance: 0.01,
        gate: {
          passed: false,
          reason:
            "Bloqueada: acha 3,0 p.p. menos lavadoras na fila que a versão ativa (lightgbm_v1) no mesmo período de teste (92,1% contra 95,1%); o limite é 1 p.p.",
        },
      },
      feedback: {
        used: false,
        include_simulated: false,
        labels: null,
        labels_in_validation: 0,
        labels_reserved_for_test: 0,
        transactions_covered: 0,
        transactions_weighted: 0,
        transactions_without_truth: 0,
        conflicts: 0,
        split: "official",
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
        pr_auc: 0.896,
        recall_at_fpr: 0.897,
        f1: 0.89,
        queue_recall: 0.951,
        queue_precision: 0.99,
        innocents_per_week: 2.2,
      },
      comparison: null,
      feedback: null,
    },
  ],
};

/** Promove na memória da aba, respeitando a trava como a API (409 com o motivo). */
export function promoteModelMock(version: string): Models {
  const target = modelsMock.versions.find((v) => v.version === version);
  if (!target) throw new Error("Versão do modelo não encontrada.");
  if (target.comparison && !target.comparison.gate.passed)
    throw new Error(target.comparison.gate.reason ?? "A trava de promoção bloqueou esta versão.");
  for (const item of modelsMock.versions) item.active = item.version === version;
  modelsMock.active_version = version;
  return modelsMock;
}
