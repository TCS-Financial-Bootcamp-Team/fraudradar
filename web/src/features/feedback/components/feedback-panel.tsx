"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { RefreshBar, ResourceError } from "@/components/ui/states";
import { WeeklyRateChart } from "@/features/alerts/components/charts";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { useServerMessage } from "@/i18n/server-messages";
import { useFormatters } from "@/i18n/use-formatters";
import { formatNumber, formatPercent } from "@/lib/format";
import { useFeedbackSummary } from "../hooks/use-feedback";
import type { FeedbackSummary, Rate } from "../schemas/feedback";

export type FeedbackCell = {
  key: "precision" | "outside" | "labels" | "newSince";
  label: string;
  value: string | null;
  emptyMessage?: string;
  note: string;
  tooltipLabel: string;
  tooltip: string;
};

/** As células do painel, já estruturadas para exibição (exportado para os testes). */
export function feedbackCells(
  summary: FeedbackSummary,
  locale: AppLocale = DEFAULT_LOCALE,
): FeedbackCell[] {
  const t = getT("alerts.feedback", locale);
  const n = (value: number) => formatNumber(value, locale);
  const precision = summary.confirmed_precision;
  const sample = summary.control_sample;
  const outside = sample.found_outside_queue;
  const small = (rate: Rate) =>
    rate.low_sample && rate.value !== null ? t("smallSample") : "";

  return [
    {
      key: "precision",
      label: t("cells.precision"),
      value: precision.value === null ? null : formatPercent(precision.value, locale),
      emptyMessage:
        precision.value === null ? t("cells.precisionEmpty") : undefined,
      note:
        precision.value === null
          ? t("cells.precisionEmptyHint")
          : t("cells.precisionNote", {
              numerator: n(precision.numerator),
              denominator: n(precision.denominator),
              small: small(precision),
            }),
      tooltipLabel: t("tooltips.precisionLabel"),
      tooltip: t("tooltips.precision"),
    },
    {
      key: "outside",
      label: t("cells.outside"),
      value: outside.value === null ? null : formatPercent(outside.value, locale),
      emptyMessage:
        outside.value === null ? t("cells.outsideEmpty") : undefined,
      note:
        outside.value === null
          ? sample.sampled > 0
            ? t("cells.outsideEmptySampled", { sampled: sample.sampled })
            : t("cells.outsideEmptyNone")
          : t("cells.outsideNote", {
              numerator: n(outside.numerator),
              reviewed: n(sample.reviewed),
              sampled: n(sample.sampled),
              small: small(outside),
            }),
      tooltipLabel: t("tooltips.outsideLabel"),
      tooltip: t("tooltips.outside"),
    },
    {
      key: "labels",
      label: t("cells.labels"),
      value: n(summary.labels.total),
      note:
        summary.labels.total === 0
          ? t("cells.labelsEmpty")
          : t("cells.labelsNote", {
              laundering: n(summary.labels.laundering),
              falsePositive: n(summary.labels.false_positive),
            }),
      tooltipLabel: t("tooltips.labelsLabel"),
      tooltip: t("tooltips.labels"),
    },
    {
      key: "newSince",
      label: t("cells.newSince"),
      value: n(summary.new_since_active),
      note: !summary.active_version
        ? t("cells.noActive")
        : summary.new_since_active === 0
          ? t("cells.newSinceZero", { version: summary.active_version })
          : t("cells.newSinceNote", { version: summary.active_version }),
      tooltipLabel: t("tooltips.newSinceLabel"),
      tooltip: t("tooltips.newSince"),
    },
  ];
}

export function FeedbackPanel() {
  const t = useTranslations("alerts.feedback");
  const format = useFormatters();
  const resource = useFeedbackSummary();

  return (
    <section
      aria-label={t("region")}
      aria-busy={resource.refreshing || undefined}
      className="relative flex flex-col gap-5 overflow-hidden rounded-[14px] border border-border bg-card p-[20px_22px]"
    >
      <RefreshBar active={resource.refreshing} />
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="m-0 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {t("intro")}
          </p>
        </div>
        {resource.data?.end && (
          <span className="text-xs text-muted-foreground">
            {t("untilWeekDate", { week: format.shortDate(resource.data.end) })}
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
            "flex flex-col gap-6 transition-opacity duration-150 motion-reduce:transition-none",
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
  const t = useTranslations("alerts.feedback");
  const locale = useLocale();
  const serverMessage = useServerMessage();
  const labels = summary.labels;
  const cells = feedbackCells(summary, locale);

  return (
    <>
      <p className="m-0 rounded-[10px] border border-border/80 bg-soft/50 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">
          {t("distinctionTitle")}
        </strong>
        {t("distinctionBody")}
      </p>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {cells.map((cell) => (
          <div
            key={cell.key}
            className="flex min-w-0 flex-col gap-1.5 bg-card p-[18px_20px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-muted-foreground">
                {cell.label}
              </span>
              <InfoTooltip label={cell.tooltipLabel} content={cell.tooltip} />
            </div>
            {cell.value !== null ? (
              <span className="font-mono text-[32px] font-medium leading-[1.1] tracking-tight tabular-nums text-foreground">
                {cell.value}
              </span>
            ) : (
              <p className="m-0 pt-0.5 text-[13px] font-medium leading-snug text-foreground">
                {cell.emptyMessage}
              </p>
            )}
            <span className="text-xs leading-relaxed text-muted-foreground">
              {cell.note}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-[13px] font-medium text-foreground">
              {t("weeklyTitle")}
            </h3>
            <InfoTooltip
              label={t("tooltips.weeklyLabel")}
              content={t("tooltips.weekly")}
            />
          </div>
          <WeeklyRateChart
            data={summary.weekly_confirmed_precision}
            unit={t("unit")}
            emptyText={t("weeklyEmpty")}
            emptyHint={t("weeklyEmptyHint")}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="m-0 text-[13px] font-medium text-foreground">
            {t("compositionTitle")}
          </h3>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {t("compositionBySource")}
              </span>
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  [t("breakdown.analyst"), labels.analyst],
                  [t("breakdown.simulated"), labels.simulated],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex flex-col gap-0.5 border-t border-soft pt-2"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="m-0 font-mono text-xl font-medium tabular-nums text-foreground">
                      {formatNumber(Number(value), locale)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {t("compositionByOrigin")}
              </span>
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  [t("breakdown.model"), labels.model],
                  [t("breakdown.exploration"), labels.exploration],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex flex-col gap-0.5 border-t border-soft pt-2"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="m-0 font-mono text-xl font-medium tabular-nums text-foreground">
                      {formatNumber(Number(value), locale)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {labels.total === 0 && (
              <p className="m-0 text-xs leading-relaxed text-muted-foreground">
                {t("compositionEmptyHint")}
              </p>
            )}
          </div>
        </div>
      </div>

      {labels.simulated > 0 && (
        <p className="m-0 rounded-[10px] border border-border/80 bg-soft/60 px-3 py-2 text-xs leading-relaxed text-foreground">
          {t("simulatedNote", { count: labels.simulated })}
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-t border-soft pt-3.5 text-xs text-muted-foreground">
        <p className="m-0 leading-relaxed">
          <span className="font-medium text-foreground">{t("retrain")}</span>
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
        <Link
          href="/settings"
          className="shrink-0 text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground"
        >
          {t("retrainSettingsLink")}
        </Link>
      </div>
    </>
  );
}
