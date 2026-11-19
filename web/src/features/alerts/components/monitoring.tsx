"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CreditCard, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "cn";
import { useAppContext } from "@/components/app-context";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  EmptyState,
  LoadingState,
  RefreshBar,
  ResourceError,
} from "@/components/ui/states";
import { WeekPicker } from "@/features/alerts/components/week-picker";
import {
  usePublishPageContext,
  type PublishedPageContext,
} from "@/features/assistant/lib/page-context";
import { FeedbackPanel } from "@/features/feedback/components/feedback-panel";
import { useFormatters } from "@/i18n/use-formatters";
import { useMonitoring } from "../hooks/use-alerts";

// Limiar para destacar taxa de alerta como sinal de concentração de risco:
// Em PLD no SAML-D, taxas de alerta a partir de 3,0% indicam concentração elevada.
const SIGNAL_RATE_THRESHOLD = 0.03;

function HorizontalRateBar({
  name,
  value,
  maxVal,
}: {
  name: string;
  value: number;
  maxVal: number;
}) {
  const format = useFormatters();
  const percentWidth = Math.min(
    100,
    Math.max(2, maxVal > 0 ? (value / maxVal) * 100 : 0),
  );
  const isSignal = value >= SIGNAL_RATE_THRESHOLD;

  return (
    <li
      className="grid grid-cols-[minmax(96px,120px)_minmax(0,1fr)_52px] items-center gap-3 text-sm sm:grid-cols-[150px_minmax(0,1fr)_52px]"
      title={`${name}: ${format.percent(value)}`}
    >
      <span className="truncate text-[13px] text-foreground" title={name}>
        {name}
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-track">
        <span
          className={cn(
            "block h-full rounded-full transition-all",
            isSignal ? "bg-signal" : "bg-primary",
          )}
          style={{ width: `${percentWidth}%` }}
        />
      </span>
      <span className="text-right font-mono text-xs tabular-nums text-foreground">
        {format.percent(value)}
      </span>
    </li>
  );
}

function RateCard({
  title,
  subtitle,
  tooltipLabel,
  tooltip,
  emptyTitle,
  emptyHint,
  emptyIcon,
  items,
}: {
  title: string;
  subtitle: string;
  tooltipLabel: string;
  tooltip: string;
  emptyTitle: string;
  emptyHint: string;
  emptyIcon: "country" | "payment";
  items: Array<{ name: string; value: number }>;
}) {
  const t = useTranslations("alerts.monitoring");
  const maxVal = Math.max(...items.map((r) => r.value), 0.01);
  const hasSignal = items.some((r) => r.value >= SIGNAL_RATE_THRESHOLD);
  const EmptyIcon = emptyIcon === "country" ? Globe : CreditCard;

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-card p-[20px_22px]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-sm font-semibold text-foreground">{title}</h3>
          <InfoTooltip label={tooltipLabel} content={tooltip} />
        </div>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </header>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border bg-soft/40 px-4 py-6 text-center">
          <EmptyIcon
            className="size-5 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="m-0 text-[13px] font-medium text-foreground">
            {emptyTitle}
          </p>
          <p className="m-0 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {emptyHint}
          </p>
        </div>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-[11px] p-0">
            {items.map((r) => (
              <HorizontalRateBar
                key={r.name}
                name={r.name}
                value={r.value}
                maxVal={maxVal}
              />
            ))}
          </ul>
          {hasSignal && (
            <p className="m-0 flex items-center gap-2 border-t border-soft pt-2.5 text-xs text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full bg-signal"
                aria-hidden="true"
              />
              <span>{t("signalLegend")}</span>
            </p>
          )}
        </>
      )}
    </article>
  );
}

type QueueKpi = {
  key: string;
  label: string;
  value: string | null;
  emptyMessage?: string;
  note: string;
  tooltipLabel: string;
  tooltip: string;
};

export function MonitoringView() {
  const t = useTranslations("alerts.monitoring");
  const format = useFormatters();
  const { week } = useAppContext();
  const resource = useMonitoring();

  const pageContextValue = useMemo<PublishedPageContext>(() => {
    const filters: Record<string, string> = {};
    if (week) filters.week = week;
    return {
      pageState: {
        filters,
        visible_alert_ids: [],
        page: null,
        total: null,
      },
    };
  }, [week]);
  usePublishPageContext(pageContextValue);

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {week && (
          <p className="m-0 text-[13px] text-muted-foreground">
            {t("weekOf", { week: format.shortDate(week) })}
            <Link
              href="/alerts"
              className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground"
            >
              {t("changeInQueue")}
            </Link>
          </p>
        )}
        <h1 className="m-0 text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground">
          {t("title")}
        </h1>
        <p className="m-0 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("intro")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <WeekPicker />
      </div>
    </div>
  );

  if (resource.loading) return <LoadingState />;

  if (resource.data === null)
    return (
      <div className="flex w-full max-w-[1320px] flex-col gap-8">
        {heading}
        <section className="rounded-[14px] border border-border bg-card p-6">
          <EmptyState
            title={t("noPeriodTitle")}
            description={t("noPeriodBody")}
          />
        </section>
        <FeedbackPanel />
      </div>
    );

  if (resource.error || !resource.data)
    return (
      <div className="flex w-full max-w-[1320px] flex-col gap-8">
        {heading}
        <ResourceError
          message={resource.error ?? t("unavailable")}
          onRetry={resource.reload}
        />
      </div>
    );

  const data = resource.data;
  const { alerts, alert_rate: alertRate, reviewed, reported } = data.indicators;
  const hasAlertRate = alertRate !== null && alertRate !== undefined;

  const kpis: QueueKpi[] = [
    {
      key: "alerts",
      label: t("kpi.alerts"),
      value: format.number(alerts),
      note: alerts === 0 ? t("kpi.alertsZero") : t("kpi.alertsNote"),
      tooltipLabel: t("tooltips.alertsLabel"),
      tooltip: t("tooltips.alerts"),
    },
    {
      key: "rate",
      label: t("kpi.rate"),
      value: hasAlertRate ? format.percent(alertRate) : null,
      emptyMessage: hasAlertRate ? undefined : t("kpi.rateEmpty"),
      note: !hasAlertRate
        ? t("alertRateNote")
        : alerts === 0
          ? t("kpi.rateZero")
          : t("alertRateNote"),
      tooltipLabel: t("tooltips.rateLabel"),
      tooltip: t("tooltips.rate"),
    },
    {
      key: "reviewed",
      label: t("kpi.reviewed"),
      value: format.number(reviewed),
      note:
        alerts === 0
          ? t("kpi.reviewedNoAlerts")
          : reviewed === 0
            ? t("kpi.reviewedZero")
            : t("kpi.reviewedNote", {
                reviewed: format.number(reviewed),
                total: format.number(alerts),
              }),
      tooltipLabel: t("tooltips.reviewedLabel"),
      tooltip: t("tooltips.reviewed"),
    },
    {
      key: "reported",
      label: t("kpi.reported"),
      value: format.number(reported),
      note: reported === 0 ? t("kpi.reportedZero") : t("kpi.reportedNote"),
      tooltipLabel: t("tooltips.reportedLabel"),
      tooltip: t("tooltips.reported"),
    },
  ];

  return (
    <div
      className="flex w-full max-w-[1320px] flex-col gap-8"
      aria-busy={resource.refreshing || undefined}
    >
      {heading}

      <section aria-label={t("indicators")} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("indicators")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("indicatorsScope")}
          </span>
        </div>

        <div
          className={cn(
            "relative grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border transition-opacity duration-150 sm:grid-cols-2 lg:grid-cols-4 motion-reduce:transition-none",
            resource.refreshing && "opacity-60",
          )}
        >
          <RefreshBar active={resource.refreshing} />
          {kpis.map((k) => (
            <div
              key={k.key}
              className="flex min-w-0 flex-col gap-1.5 bg-card p-[18px_20px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-muted-foreground">
                  {k.label}
                </span>
                <InfoTooltip label={k.tooltipLabel} content={k.tooltip} />
              </div>
              {k.value !== null ? (
                <span className="font-mono text-[32px] font-medium leading-[1.1] tracking-tight tabular-nums text-foreground">
                  {k.value}
                </span>
              ) : (
                <p className="m-0 pt-0.5 text-[13px] font-medium leading-snug text-foreground">
                  {k.emptyMessage}
                </p>
              )}
              <span className="text-xs leading-relaxed text-muted-foreground">
                {k.note}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-label={t("distributionTitle")}
        className={cn(
          "flex flex-col gap-3 transition-opacity duration-150 motion-reduce:transition-none",
          resource.refreshing && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("distributionTitle")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t("distributionSubtitle")}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RateCard
            title={t("countryRate")}
            subtitle={t("alertRateNote")}
            tooltipLabel={t("tooltips.countryRateLabel")}
            tooltip={t("tooltips.countryRate")}
            emptyTitle={t("countryEmptyTitle")}
            emptyHint={t("countryEmptyHint")}
            emptyIcon="country"
            items={data.country_rates}
          />
          <RateCard
            title={t("paymentRate")}
            subtitle={t("alertRateNote")}
            tooltipLabel={t("tooltips.paymentRateLabel")}
            tooltip={t("tooltips.paymentRate")}
            emptyTitle={t("paymentEmptyTitle")}
            emptyHint={t("paymentEmptyHint")}
            emptyIcon="payment"
            items={data.payment_type_rates}
          />
        </div>
      </section>

      <FeedbackPanel />

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {t("footerBefore")}
        <Link
          href="/settings"
          className="text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground"
        >
          {t("footerLink")}
        </Link>
        {t("footerAfter")}
      </p>
    </div>
  );
}
