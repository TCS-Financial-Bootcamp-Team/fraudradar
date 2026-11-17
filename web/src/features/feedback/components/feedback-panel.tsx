"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { RefreshBar, ResourceError } from "@/components/ui/states";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { useServerMessage } from "@/i18n/server-messages";
import { WeeklyRateChart } from "@/features/alerts/components/charts";
import { formatNumber, formatPercent } from "@/lib/format";
import { useFeedbackSummary } from "../hooks/use-feedback";
import type { FeedbackSummary, Rate } from "../schemas/feedback";

function rateText(rate: Rate, locale: AppLocale) {
  return rate.value === null ? "—" : formatPercent(rate.value, locale);
}

/** As células do painel, já em texto (exportado para os testes). */
export function feedbackCells(
  summary: FeedbackSummary,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("models.feedback", locale);
  const n = (value: number) => formatNumber(value, locale);
  const precision = summary.confirmed_precision;
  const sample = summary.control_sample;
  const outside = sample.found_outside_queue;
  const small = (rate: Rate) =>
    rate.low_sample && rate.value !== null ? t("smallSample") : "";
  return [
    {
      label: t("cells.precision"),
      value: rateText(precision, locale),
      note:
        precision.value === null
          ? t("cells.precisionNone")
          : t("cells.precisionNote", {
              numerator: n(precision.numerator),
              denominator: n(precision.denominator),
              small: small(precision),
            }),
    },
    {
      label: t("cells.outside"),
      value: rateText(outside, locale),
      note:
        sample.sampled === 0
          ? t("cells.outsideNone")
          : t("cells.outsideNote", {
              numerator: n(outside.numerator),
              reviewed: n(sample.reviewed),
              sampled: n(sample.sampled),
              small: small(outside),
            }),
    },
    {
      label: t("cells.labels"),
      value: n(summary.labels.total),
      note: t("cells.labelsNote", {
        laundering: n(summary.labels.laundering),
        falsePositive: n(summary.labels.false_positive),
      }),
    },
    {
      label: t("cells.newSince"),
      value: n(summary.new_since_active),
      note: summary.active_version
        ? t("cells.newSinceNote", { version: summary.active_version })
        : t("cells.noActive"),
    },
  ];
}

export function FeedbackPanel() {
  const t = useTranslations("models.feedback");
  const resource = useFeedbackSummary();

  return (
    <section
      aria-label={t("region")}
      aria-busy={resource.refreshing || undefined}
      className="relative flex flex-col gap-5 overflow-hidden rounded-[14px] border border-border bg-card p-[20px_22px]"
    >
      <RefreshBar active={resource.refreshing} />
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="m-0 max-w-2xl text-xs text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        {resource.data?.end && (
          <span className="text-xs text-muted-foreground">
            {t("untilWeek")}
          </span>
        )}
      </header>

      {resource.loading ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {t("loading")}
        </p>
      ) : resource.error || !resource.data ? (
        <ResourceError
          message={resource.error ?? t("unavailable")}
          onRetry={resource.reload}
        />
      ) : (
        <div
          className={cn(
            "flex flex-col gap-5 transition-opacity duration-150 motion-reduce:transition-none",
            resource.refreshing && "opacity-60",
          )}
        >
          <FeedbackContent summary={resource.data} />
        </div>
      )}
    </section>
  );
}

function FeedbackContent({ summary }: { summary: FeedbackSummary }) {
  const t = useTranslations("models.feedback");
  const locale = useLocale();
  const serverMessage = useServerMessage();
  const labels = summary.labels;
  return (
    <>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {feedbackCells(summary, locale).map((cell) => (
          <div key={cell.label} className="flex min-w-0 flex-col gap-1 bg-card p-[18px_20px]">
            <span className="text-[13px] text-muted-foreground">{cell.label}</span>
            <span className="text-[32px] font-medium leading-[1.1] tracking-tight tabular-nums text-foreground">
              {cell.value}
            </span>
            <span className="text-xs text-muted-foreground">{cell.note}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <h3 className="m-0 text-[13px] font-medium text-foreground">
            {t("weeklyTitle")}
          </h3>
          <WeeklyRateChart
            data={summary.weekly_confirmed_precision}
            unit={t("unit")}
            emptyText={t("weeklyEmpty")}
          />
        </div>
        <dl className="m-0 grid grid-cols-2 content-start gap-x-6 gap-y-3 text-sm">
          {[
            [t("breakdown.analyst"), labels.analyst],
            [t("breakdown.simulated"), labels.simulated],
            [t("breakdown.model"), labels.model],
            [t("breakdown.exploration"), labels.exploration],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 border-t border-soft pt-2.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="m-0 text-xl font-medium tabular-nums text-foreground">
                {formatNumber(Number(value), locale)}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {labels.simulated > 0 && (
        <p className="m-0 rounded-lg bg-soft px-2.5 py-2 text-xs">
          {t("simulatedNote", { count: formatNumber(labels.simulated, locale) })}
        </p>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        {t("retrain")}
        {summary.retrain.can_retrain
          ? t("retrainAvailable")
          : summary.retrain.can_retrain_with_simulated
            ? t("retrainSimulated")
            : serverMessage(
                summary.retrain.reason_code,
                summary.retrain.reason_params,
                summary.retrain.reason,
              )}
      </p>
    </>
  );
}
