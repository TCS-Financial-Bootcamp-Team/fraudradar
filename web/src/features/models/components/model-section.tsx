"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { RefreshBar, ResourceError } from "@/components/ui/states";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import {
  translateServerMessage,
  useServerMessage,
} from "@/i18n/server-messages";
import { useFormatters } from "@/i18n/use-formatters";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { useModels } from "../hooks/use-models";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import { jobIsOpen, type Job } from "@/features/jobs/schemas/jobs";
import type {
  ComparisonMetrics,
  FeedbackUsage,
  ModelComparison,
  ModelVersion,
  TrainingFeedback,
  TrainRequest,
} from "../schemas/models";

type MetricKey = keyof ComparisonMetrics;

const COLUMNS: Array<{ key: MetricKey; percent: boolean }> = [
  { key: "pr_auc", percent: true },
  { key: "queue_recall", percent: true },
  { key: "queue_precision", percent: true },
  { key: "innocents_per_week", percent: false },
];

function metricText(
  value: number | null,
  percent: boolean,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  if (value === null) return "—";
  return percent
    ? formatPercent(value, locale)
    : formatNumber(Math.round(value * 10) / 10, locale);
}

/** Diferença para a versão ativa, em texto ("+1,2 p.p." / "−3,4"); vazio sem base de comparação. */
export function metricDelta(
  value: number | null,
  base: number | null,
  percent: boolean,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  if (value === null || base === null) return "";
  const t = getT("models.model", locale);
  const diff = percent ? (value - base) * 100 : value - base;
  if (Math.abs(diff) < 0.05) return t("same");
  const text = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(diff);
  return `${text.replace("-", "−")}${percent ? t("pp") : ""}`;
}

/** O resultado da trava de promoção, em uma linha. */
export function gateText(
  comparison: ModelComparison,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("models.model", locale);
  if (comparison.gate.passed) return t("canPromote");
  const diff = comparison.recall_difference;
  if (diff === null)
    return (
      translateServerMessage(
        comparison.gate.reason_code,
        comparison.gate.reason_params,
        comparison.gate.reason,
        locale,
      ) ?? t("gateBlockedDefault")
    );
  return t("gateBlocked", {
    points: formatDecimal(Math.abs(diff) * 100, 1, locale),
  });
}

/** Por que a versão não pode ser promovida (a trava falhou); null quando pode. */
export function promoteBlockReason(
  version: ModelVersion,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const comparison = version.comparison;
  if (!comparison || comparison.gate.passed) return null;
  return (
    translateServerMessage(
      comparison.gate.reason_code,
      comparison.gate.reason_params,
      comparison.gate.reason,
      locale,
    ) ?? gateText(comparison, locale)
  );
}

/** O retorno que a versão usou no treino, em uma linha; null quando ela não usou retorno. */
export function feedbackText(
  feedback: FeedbackUsage | null,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  if (!feedback?.used || !feedback.labels) return null;
  const t = getT("models.model", locale);
  const n = (value: number) => formatNumber(value, locale);
  const labels = feedback.labels;
  const parts = [
    t("feedbackLabels", {
      total: n(labels.total),
      laundering: n(labels.laundering),
      falsePositive: n(labels.false_positive),
    }),
  ];
  if (feedback.labels_in_validation)
    parts.push(t("feedbackValidation", { count: n(feedback.labels_in_validation) }));
  if (feedback.labels_reserved_for_test)
    parts.push(t("feedbackReserved", { count: n(feedback.labels_reserved_for_test) }));
  if (feedback.conflicts)
    parts.push(t("feedbackConflicts", { count: n(feedback.conflicts) }));
  return t("feedbackUsed", { parts: parts.join(" · ") });
}

/** O que a escolha de treino permite: as opções e por que o treino não pode sair. */
export function trainChoiceState(
  feedback: TrainingFeedback,
  choice: TrainRequest,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("models.model", locale);
  const n = (value: number) => formatNumber(value, locale);
  const analyst = feedback.analyst.laundering + feedback.analyst.false_positive;
  const simulated = feedback.simulated.laundering + feedback.simulated.false_positive;
  const reason = !choice.use_feedback
    ? null
    : choice.include_simulated
      ? translateServerMessage(
          feedback.blocked_reason_with_simulated_code,
          feedback.blocked_reason_with_simulated_params,
          feedback.blocked_reason_with_simulated,
          locale,
        )
      : translateServerMessage(
          feedback.blocked_reason_code,
          feedback.blocked_reason_params,
          feedback.blocked_reason,
          locale,
        );
  return {
    analystLabel: t("analystLabel", {
      total: n(analyst),
      laundering: n(feedback.analyst.laundering),
      falsePositive: n(feedback.analyst.false_positive),
    }),
    showSimulated: simulated > 0,
    simulatedLabel: t("simulatedLabel", {
      total: n(simulated),
      laundering: n(feedback.simulated.laundering),
      falsePositive: n(feedback.simulated.false_positive),
    }),
    // Dá para pedir o retorno se ele basta sozinho ou com o simulado.
    feedbackPossible:
      feedback.blocked_reason === null || feedback.blocked_reason_with_simulated === null,
    blockedReason: reason,
  };
}

function TrainingProgress({ job }: { job: Job }) {
  const t = useTranslations("models.model");
  const jobMessage = useJobMessage();
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{jobMessage(job) ?? t("trainQueued")}</span>
        <span className="font-mono tabular-nums text-foreground">
          {job.progress}%
        </span>
      </div>
      <div
        className="h-2 bg-track rounded-full overflow-hidden"
        role="progressbar"
        aria-label={t("progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
      >
        <span
          className="block h-full rounded-full bg-primary transition-all"
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  );
}

function TrainChoice({
  feedback,
  busy,
  onTrain,
  onCancel,
}: {
  feedback: TrainingFeedback;
  busy: boolean;
  onTrain: (choice: TrainRequest) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("models.model");
  const locale = useLocale();
  const serverMessage = useServerMessage();
  const [choice, setChoice] = useState<TrainRequest>({
    use_feedback: false,
    include_simulated: false,
  });
  const state = trainChoiceState(feedback, choice, locale);
  return (
    <div
      role="dialog"
      aria-label={t("trainDialog")}
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
    >
      <p className="m-0 text-sm text-foreground">
        {t("trainIntro")}
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-1"
          checked={choice.use_feedback}
          disabled={!state.feedbackPossible}
          onChange={(event) =>
            setChoice({
              use_feedback: event.target.checked,
              include_simulated: event.target.checked && choice.include_simulated,
            })
          }
        />
        <span>{state.analystLabel}</span>
      </label>
      {state.showSimulated && (
        <label className="flex min-h-11 items-start gap-3 pl-6 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={choice.include_simulated}
            disabled={!choice.use_feedback}
            onChange={(event) =>
              setChoice({ ...choice, include_simulated: event.target.checked })
            }
          />
          <span>{state.simulatedLabel}</span>
        </label>
      )}
      {!state.feedbackPossible && feedback.blocked_reason && (
        <p className="m-0 text-xs text-muted-foreground">
          {serverMessage(
            feedback.blocked_reason_code,
            feedback.blocked_reason_params,
            feedback.blocked_reason,
          )}
        </p>
      )}
      {state.blockedReason && (
        <p role="alert" className="m-0 text-xs text-signal">
          {state.blockedReason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || state.blockedReason !== null}
          onClick={() => onTrain(choice)}
        >
          {t("train")}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}

export function ModelSection() {
  const t = useTranslations("models.model");
  const locale = useLocale();
  const format = useFormatters();
  const jobMessage = useJobMessage();
  const serverMessage = useServerMessage();
  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "—"
      : format.dateTime(date, { timeZone: undefined });
  };
  const { data, error, loading, refreshing, reload, job, busy, train, promote } =
    useModels();
  const [candidate, setCandidate] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  if (loading && !data)
    return (
      <section
        aria-label={t("region")}
        className="panel p-6 text-sm text-muted-foreground"
      >
        {t("loading")}
      </section>
    );
  if (error || !data)
    return (
      <ResourceError
        message={error ?? t("unavailable")}
        onRetry={reload}
      />
    );

  const active = data.versions.find((v) => v.active) ?? null;
  const training = job !== null && jobIsOpen(job);
  const trainDisabled = !data.can_train || training || busy;
  const failed = job !== null && job.status === "failed" ? job : null;
  const reason = training
    ? t("trainRunning")
    : serverMessage(
        data.train_blocked_reason_code,
        data.train_blocked_reason_params,
        data.train_blocked_reason,
      );
  const toPromote = data.versions.find((v) => v.version === candidate) ?? null;

  const metricCell = (version: ModelVersion, key: MetricKey, percent: boolean) => {
    const comparison = version.active ? null : version.comparison;
    const own = comparison ? comparison.candidate[key] : version.metrics[key];
    return (
      <td key={key} className="py-3 pr-4 text-right tabular-nums">
        <span className="font-mono text-xs text-foreground">
          {metricText(own, percent, locale)}
        </span>
        {comparison ? (
          <span className="block text-xs text-muted-foreground">
            {t("activeMetric", {
              value: metricText(comparison.active[key], percent, locale),
              delta: metricDelta(own, comparison.active[key], percent, locale),
            })}
          </span>
        ) : (
          !version.active &&
          active && (
            <span
              className="block text-xs text-muted-foreground"
              title={t("oldCardHint")}
            >
              {metricDelta(own, active.metrics[key], percent, locale)}
            </span>
          )
        )}
      </td>
    );
  };

  const row = (version: ModelVersion) => {
    const blocked = promoteBlockReason(version, locale);
    const usage = feedbackText(version.feedback, locale);
    const comparison = version.active ? null : version.comparison;
    return (
      <tr key={version.version} className="border-t border-soft align-top">
        <td className="py-3 pr-4">
          <span className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${version.active ? "bg-primary" : "bg-track"}`}
            />
            <span className="font-mono text-xs text-foreground">
              {version.version}
            </span>
            {version.feedback?.used && version.feedback.include_simulated && (
              <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground">
                {t("simulatedBadge")}
              </span>
            )}
          </span>
          <span className="block pl-4 text-xs text-muted-foreground">
            {version.active ? t("statusActive") : t("statusAvailable")} ·{" "}
            {version.source === "official"
              ? t("sourceOfficial")
              : t("sourceRetrain")}{" "}
            · {formatDate(version.created_at)}
            {version.train_end
              ? t("trainUntil", { date: formatDate(version.train_end) })
              : ""}
          </span>
          {comparison && (
            <span
              className={`block pl-4 text-xs ${comparison.gate.passed ? "text-muted-foreground" : "text-signal"}`}
            >
              {t("comparedWith", {
                gate: gateText(comparison, locale),
                version: comparison.active_version,
              })}
              {comparison.period.start
                ? t("comparedPeriod", {
                    weeks: comparison.period.weeks,
                    start: formatDate(comparison.period.start),
                  })
                : ""}
            </span>
          )}
          {usage && (
            <span className="block max-w-md pl-4 text-xs text-muted-foreground">
              {usage}
            </span>
          )}
        </td>
        {COLUMNS.map(({ key, percent }) => metricCell(version, key, percent))}
        <td className="py-3 text-right">
          {!version.active && (
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || blocked !== null}
                title={blocked ?? undefined}
                onClick={() => setCandidate(version.version)}
              >
                {t("promote")}
              </Button>
              {blocked && <span className="sr-only">{blocked}</span>}
            </div>
          )}
        </td>
      </tr>
    );
  };

  return (
    <section
      aria-label={t("region")}
      aria-busy={refreshing || undefined}
      className="relative overflow-hidden bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-5"
    >
      <RefreshBar active={refreshing} />
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="m-0 text-xs text-muted-foreground">
            {t("activeVersion")}
            <span className="font-mono text-foreground">
              {active?.version ?? t("none")}
            </span>
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            disabled={trainDisabled || choosing}
            onClick={() => setChoosing(true)}
          >
            {t("trainNew")}
          </Button>
          {trainDisabled && reason && (
            <p className="m-0 max-w-sm text-right text-xs text-muted-foreground">
              {reason}
            </p>
          )}
        </div>
      </header>

      {choosing && !trainDisabled && (
        <TrainChoice
          feedback={data.training_feedback}
          busy={busy}
          onCancel={() => setChoosing(false)}
          onTrain={(choice) => {
            setChoosing(false);
            void train(choice);
          }}
        />
      )}
      {job && training && <TrainingProgress job={job} />}
      {failed && (
        <p role="alert" className="m-0 text-xs text-signal">
          {t("lastTrainFailed", {
            message: jobMessage(failed) ?? t("checkLogs"),
          })}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[13px] font-medium text-foreground">
          {t("validationTitle")}
        </h3>
        <p className="m-0 text-xs text-muted-foreground">
          {t("validationNote")}
        </p>
      </div>

      {data.versions.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">
          {t("noVersions")}
        </p>
      ) : (
        <div
          className={cn(
            "overflow-x-auto transition-opacity duration-150 motion-reduce:transition-none",
            refreshing && "pointer-events-none opacity-60",
          )}
        >
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 pr-4 text-left font-normal">
                  {t("colVersion")}
                </th>
                {COLUMNS.map(({ key }) => (
                  <th key={key} className="pb-2 pr-4 text-right font-normal">
                    {t(`metrics.${key}`)}
                  </th>
                ))}
                <th className="pb-2 text-right font-normal">
                  <span className="sr-only">{t("colActions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>{data.versions.map(row)}</tbody>
          </table>
        </div>
      )}

      {toPromote && (
        <div
          role="alertdialog"
          aria-label={t("promoteTitle", { version: toPromote.version })}
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
        >
          <p className="m-0 text-sm text-foreground">
            {t("promoteQuestion", { version: toPromote.version })}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {t("promoteNote")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const version = toPromote.version;
                setCandidate(null);
                void promote(version);
              }}
            >
              {t("confirmPromote")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCandidate(null)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
