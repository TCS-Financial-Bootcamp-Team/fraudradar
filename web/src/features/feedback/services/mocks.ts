import {
  currentAlertsMock,
  decisionOfMock,
} from "@/features/alerts/services/mocks";
import type { Alert } from "@/features/alerts/schemas/alerts";
import type { FeedbackRange, FeedbackSummary, Rate } from "../schemas/feedback";

const LOW_SAMPLE = 20;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rate(numerator: number, denominator: number): Rate {
  return {
    value: denominator ? numerator / denominator : null,
    numerator,
    denominator,
    low_sample: denominator < LOW_SAMPLE,
  };
}

// O rótulo que a última decisão deixou: comunicar = 1, falso positivo confirmado = 0.
function labelOf(alert: Alert): 0 | 1 | null {
  const decision = decisionOfMock(alert);
  if (decision?.decision === "report") return 1;
  if (decision?.decision === "archive" && decision.archive_reason === "false_positive")
    return 0;
  return null;
}

export function feedbackSummaryMock(range: FeedbackRange = {}): FeedbackSummary {
  const alerts = currentAlertsMock().filter(
    (a) => (!range.from || a.week >= range.from) && (!range.to || a.week <= range.to),
  );
  const labeled = alerts
    .map((alert) => ({ alert, label: labelOf(alert) }))
    .filter((item): item is { alert: Alert; label: 0 | 1 } => item.label !== null);
  const fromQueue = labeled.filter((item) => item.alert.origin === "model");
  const sampled = alerts.filter((a) => a.origin === "exploration");
  const reviewed = labeled.filter((item) => item.alert.origin === "exploration");
  const weeks = [...new Set(fromQueue.map((item) => item.alert.week))].sort();
  return {
    start: range.from ?? null,
    end: range.to ?? null,
    labels: {
      total: labeled.length,
      laundering: labeled.filter((item) => item.label === 1).length,
      false_positive: labeled.filter((item) => item.label === 0).length,
      analyst: labeled.length,
      simulated: 0,
      model: fromQueue.length,
      exploration: reviewed.length,
    },
    confirmed_precision: rate(
      fromQueue.filter((item) => item.label === 1).length,
      fromQueue.length,
    ),
    weekly_confirmed_precision: weeks.map((week) => {
      const ofWeek = fromQueue.filter((item) => item.alert.week === week);
      const [, month, day] = week.split("-");
      return {
        week,
        name: `${day} ${MONTHS[Number(month) - 1]}`,
        ...rate(ofWeek.filter((item) => item.label === 1).length, ofWeek.length),
      };
    }),
    control_sample: {
      sampled: sampled.length,
      reviewed: reviewed.length,
      found_outside_queue: rate(
        reviewed.filter((item) => item.label === 1).length,
        reviewed.length,
      ),
    },
    active_version: "lightgbm_v1",
    new_since_active: labeled.length,
    retrain: {
      can_retrain: false,
      reason: `O retreino com o retorno precisa de pelo menos 50 rótulos dos analistas em períodos fechados; há ${labeled.length}.`,
      can_retrain_with_simulated: false,
      reason_with_simulated: `O retreino com o retorno precisa de pelo menos 50 rótulos do retorno dos analistas e do simulado em períodos fechados; há ${labeled.length}.`,
    },
  };
}
