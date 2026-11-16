"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { useAppContext } from "@/components/app-context";
import {
  EmptyState,
  LoadingState,
  ResourceError,
} from "@/components/ui/states";
import { ProcessingControls } from "@/features/processing/components/processing-controls";
import { useFeedbackSummary } from "@/features/feedback/hooks/use-feedback";
import type { FeedbackSummary } from "@/features/feedback/schemas/feedback";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { useFormatters } from "@/i18n/use-formatters";
import {
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { formatDayMonth, formatScore } from "@/lib/risk";
import { useAlertQueue, useMonitoring } from "../hooks/use-alerts";
import type { AlertStatus } from "../schemas/alerts";
import {
  HorizontalBarList,
  ReviewProgressCard,
  ScoreHistogramChart,
  Sparkline,
  WeeklyAlertsChart,
  WeeklyRateChart,
} from "./charts";
import { getAlertLinkLabel } from "./alerts-table";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatWeekPeriod(
  weekStr: string,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  const parts = weekStr.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN))
    return getT("alerts.detail", locale)("weekOf", { week: weekStr });
  const [year, month, day] = parts;
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start.getTime() + 6 * 86400000);
  return getT("alerts.dashboard", locale)("weekPeriod", {
    start: formatDayMonth(start.toISOString(), locale),
    end: formatDayMonth(end.toISOString(), locale),
    year: end.getUTCFullYear(),
  });
}

/** O indicador "Precisão confirmada": alertas da fila confirmados como lavagem ÷ alertas da fila
 * com decisão conclusiva, até a semana em exibição. */
export function confirmedPrecisionKpi(
  summary: FeedbackSummary | null | undefined,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("alerts.dashboard.precision", locale);
  const rate = summary?.confirmed_precision;
  if (!rate || rate.value === null)
    return { value: "—", note: t("none"), spark: [] as number[] };
  return {
    value: formatPercent(rate.value, locale),
    note: t("note", {
      numerator: formatNumber(rate.numerator, locale),
      denominator: formatNumber(rate.denominator, locale),
      lowSample: rate.low_sample ? t("lowSample") : "",
    }),
    spark: (summary?.weekly_confirmed_precision ?? [])
      .filter((w) => w.value !== null)
      .map((w) => (w.value ?? 0) * 100),
  };
}

const STATUS_DOTS: Record<AlertStatus, string> = {
  pending: "bg-track ring-1 ring-inset ring-muted-foreground/60",
  escalated: "bg-warning",
  archived: "bg-foreground",
  reported: "bg-signal",
};

// ---------------------------------------------------------------------------
// Dashboard Component
// ---------------------------------------------------------------------------

export function Dashboard() {
  const t = useTranslations("alerts.dashboard");
  const tc = useTranslations("common.status");
  const tu = useTranslations("alerts.charts.units");
  const locale = useLocale();
  const format = useFormatters();
  const { week } = useAppContext();
  const monitoring = useMonitoring();
  const queue = useAlertQueue();
  const feedback = useFeedbackSummary();

  const weekRangeText = week ? formatWeekPeriod(week, locale) : "";

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13px] text-muted-foreground">
          {weekRangeText ? `${weekRangeText} · ` : ""}
          <Link
            href="/alerts"
            className="text-foreground underline underline-offset-[3px] decoration-border hover:decoration-foreground"
          >
            {t("changeInQueue")}
          </Link>
        </p>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          {t("title")}
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ProcessingControls />
      </div>
    </div>
  );

  if (monitoring.loading) return <LoadingState />;

  if (monitoring.data === null) {
    return (
      <div className="flex flex-col gap-9 max-w-[1320px] w-full">
        {heading}
        <section className="rounded-[14px] border border-border bg-card p-6">
          <EmptyState
            title={t("noPeriodTitle")}
            description={t("noPeriodBody")}
          />
        </section>
      </div>
    );
  }

  if (monitoring.error || !monitoring.data) {
    return (
      <div className="flex flex-col gap-9 max-w-[1320px] w-full">
        {heading}
        <ResourceError
          message={monitoring.error ?? t("unavailable")}
          onRetry={monitoring.reload}
        />
      </div>
    );
  }

  const data = monitoring.data;

  // Compute week alerts difference for sparkline note
  const alertDiffNote = (() => {
    if (data.weeks.length >= 2) {
      const cur = data.weeks[data.weeks.length - 1].value;
      const prev = data.weeks[data.weeks.length - 2].value;
      const diff = cur - prev;
      if (diff > 0) return t("diffPrev", { diff: `+${diff}` });
      if (diff < 0) return t("diffPrev", { diff });
      return t("diffSame");
    }
    return t("diffNone");
  })();

  const weekValues = data.weeks.map((w) => w.value);
  const precision = feedback.loading
    ? { value: "…", note: t("precision.loading"), spark: [] as number[] }
    : confirmedPrecisionKpi(feedback.data, locale);

  const kpis = [
    {
      label: t("kpi.alerts"),
      value: format.number(data.indicators.alerts),
      note: alertDiffNote,
      spark: weekValues,
      sparkLabel: t("kpi.alertsSpark"),
    },
    {
      label: t("kpi.rate"),
      value: format.percent(data.indicators.alert_rate),
      note: t("kpi.rateNote"),
      spark: weekValues,
      sparkLabel: t("kpi.rateSpark"),
    },
    {
      label: t("kpi.flagged"),
      value: format.currency(data.indicators.flagged_amount),
      note: t("kpi.flaggedNote"),
      spark: weekValues,
      sparkLabel: t("kpi.flaggedSpark"),
    },
    {
      label: t("kpi.precision"),
      value: precision.value,
      note: precision.note,
      spark: precision.spark,
      sparkLabel: t("kpi.precisionSpark"),
    },
  ];

  const topAlerts = queue.data?.items.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-9 max-w-[1320px] w-full">
      {heading}

      {/* KPI Strip */}
      <section
        aria-label={t("indicators")}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-[14px] overflow-hidden"
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-card p-[18px_20px_16px] flex flex-col gap-1 min-w-0"
          >
            <span className="text-[13px] text-muted-foreground">{k.label}</span>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[32px] font-medium tracking-[-0.03em] leading-[1.1] tabular-nums text-foreground">
                {k.value}
              </span>
              <Sparkline values={k.spark} label={k.sparkLabel} />
            </div>
            <span className="font-mono text-xs text-muted-foreground truncate">
              {k.note}
            </span>
          </div>
        ))}
      </section>

      {/* Charts Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Alertas por semana */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-[18px]">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.weekly")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.lastWeeks", { count: data.weeks.length })}
            </span>
          </header>
          <WeeklyAlertsChart data={data.weeks} />
        </article>

        {/* Card 2: Precisão confirmada pelos analistas */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-[18px]">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.precision")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.precisionHint")}
            </span>
          </header>
          {feedback.error ? (
            <ResourceError message={feedback.error} onRetry={feedback.reload} />
          ) : (
            <WeeklyRateChart
              data={feedback.data?.weekly_confirmed_precision ?? []}
              unit={tu("decided")}
              emptyText={
                feedback.loading
                  ? t("cards.precisionLoading")
                  : t("cards.precisionEmpty")
              }
            />
          )}
        </article>

        {/* Card 3: Distribuição da nota de risco */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-[18px]">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.distribution")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.distributionHint", { count: data.indicators.alerts })}
            </span>
          </header>
          <ScoreHistogramChart
            data={data.score_histogram}
            totalAlerts={data.indicators.alerts}
          />
        </article>

        {/* Card 4: Andamento da revisão */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-5">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.progress")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.thisWeek")}
            </span>
          </header>
          <ReviewProgressCard
            reviewed={data.indicators.reviewed}
            total={data.indicators.alerts}
            statusCounts={data.status_counts}
          />
        </article>

        {/* Card 5: Meio de pagamento */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-4">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.payment")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.paymentHint")}
            </span>
          </header>
          <HorizontalBarList items={data.payment_type_rates} isRate={true} />
        </article>

        {/* Card 6: País */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-4">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              {t("cards.country")}
            </h2>
            <span className="text-xs text-muted-foreground">
              {t("cards.countryHint", {
                amount: format.currency(data.indicators.flagged_amount),
              })}
            </span>
          </header>
          <HorizontalBarList items={data.countries} unit={tu("alerts")} />
        </article>
      </section>

      {/* Comece por aqui: Top 5 da fila */}
      <section className="rounded-[14px] border border-border bg-card p-[20px_22px_12px] flex flex-col gap-3">
        <header className="flex justify-between items-baseline">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("start.title")}
          </h2>
          <Link
            href="/alerts"
            className="text-[13px] text-foreground underline underline-offset-[3px] decoration-border hover:decoration-foreground"
          >
            {t("start.seeAll")}
          </Link>
        </header>

        {queue.loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("start.loading")}
          </p>
        ) : queue.error ? (
          <ResourceError message={queue.error} onRetry={queue.reload} />
        ) : topAlerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("start.none")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse tabular-nums text-left text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="font-normal py-2.5 pr-3">
                    {t("table.position")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    {t("table.alert")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    {t("table.account")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    {t("table.score")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    {t("table.country")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3 text-right">
                    {t("table.amount")}
                  </th>
                  <th scope="col" className="font-normal py-2.5 pl-3">
                    {t("table.status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {topAlerts.map((alert) => {
                  const dotClass =
                    STATUS_DOTS[alert.status] ?? "bg-muted-foreground";
                  return (
                    <tr
                      key={alert.id}
                      className="relative cursor-pointer border-b border-soft transition-colors hover:bg-soft/40 focus-within:bg-soft/40"
                    >
                      <td className="py-3.5 pr-3 font-mono text-xs text-muted-foreground">
                        {t("table.positionValue", { position: alert.queue_position })}
                      </td>
                      <td className="py-3.5 px-3">
                        <Link
                          href={`/alerts/${alert.id}`}
                          aria-label={getAlertLinkLabel(alert, locale)}
                          className="font-medium text-foreground underline underline-offset-[3px] decoration-border after:absolute after:inset-0 after:z-10 after:content-[''] hover:decoration-foreground focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                        >
                          {alert.id}
                        </Link>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-[13px] text-foreground">
                        {alert.account}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="inline-flex items-center gap-2.5">
                          <span className="w-8 font-medium tabular-nums">
                            {formatScore(alert.score, locale)}
                          </span>
                          <div className="w-[72px] h-1 rounded-sm bg-track overflow-hidden shrink-0">
                            <div
                              className={cn(
                                "h-full rounded-sm transition-all",
                                alert.score >= 98 ? "bg-signal" : "bg-primary",
                              )}
                              style={{ width: `${alert.score}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-[13px] text-foreground">
                        {alert.country}
                      </td>
                      <td className="py-3.5 px-3 text-right tabular-nums text-[13px] text-foreground">
                        {format.currency(alert.amount)}
                      </td>
                      <td className="py-3.5 pl-3">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              dotClass,
                            )}
                          />
                          <span>{tc(alert.status)}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
