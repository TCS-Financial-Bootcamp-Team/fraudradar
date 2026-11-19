"use client";

import * as React from "react";
import { BarChart3, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { useFormatters } from "@/i18n/use-formatters";
import { formatNumber, formatPercent } from "@/lib/format";
import { formatDayMonth } from "@/lib/risk";
import type { Series, StatusCounts } from "../schemas/alerts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function generateSparklinePath(
  values: number[],
  width = 100,
  height = 32,
  padding = 3,
): { line: string; area: string } | null {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    padding + (1 - (v - min) / spread) * (height - padding * 2),
  ]);
  const line = pts
    .map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return { line, area };
}

// Rótulo de uma semana da série: a API manda a data ISO em `week`; sem ela vale o `name`
// que veio pronto (compatibilidade).
function seriesWeekName(item: { name: string; week?: string | null }, locale: AppLocale) {
  return item.week ? formatDayMonth(item.week, locale) : item.name;
}

// Estado vazio compacto para gráficos: evita grandes blocos em branco e orienta qual ação gera dados.
function ChartEmptyState({
  icon = "bars",
  message,
  hint,
}: {
  icon?: "bars" | "trend";
  message: string;
  hint?: string;
}) {
  const Icon = icon === "trend" ? TrendingUp : BarChart3;
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border bg-soft/40 px-4 py-6 text-center">
      <Icon
        className="size-5 text-muted-foreground"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="m-0 text-[13px] font-medium text-foreground">{message}</p>
      {hint && (
        <p className="m-0 max-w-md text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline SVG component for KPI cards
// ---------------------------------------------------------------------------

export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label?: string;
  className?: string;
}) {
  const t = useTranslations("alerts.charts");
  const path = React.useMemo(
    () => generateSparklinePath(values, 100, 32, 3),
    [values],
  );

  if (!path) {
    return <div className={cn("h-8 w-24 shrink-0", className)} aria-hidden="true" />;
  }

  return (
    <svg
      width="96"
      height="32"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      role="img"
      aria-label={label ?? t("sparkline")}
      className={cn("h-8 w-24 shrink-0", className)}
    >
      <path d={path.area} fill="var(--primary)" fillOpacity="0.08" />
      <path
        d={path.line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// WeeklyAlertsChart: Alertas por semana (bars)
// ---------------------------------------------------------------------------

export function WeeklyAlertsChart({
  data,
  currentWeekName,
  emptyHint,
}: {
  data: Series[];
  currentWeekName?: string;
  emptyHint?: string;
}) {
  const t = useTranslations("alerts.charts.weekly");
  const locale = useLocale();
  if (!data || data.length === 0) {
    return <ChartEmptyState icon="bars" message={t("empty")} hint={emptyHint} />;
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const ariaLabel = t("aria", {
    items: data
      .map((d) => t("item", { name: seriesWeekName(d, locale), value: d.value }))
      .join(", "),
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-[180px] items-end gap-1.5 border-b border-border pb-1"
      >
        {data.map((w, i) => {
          const isCurrent = currentWeekName
            ? w.name === currentWeekName
            : i === data.length - 1;
          const barHeight = Math.max(4, Math.round((w.value / maxValue) * 135));
          const label = seriesWeekName(w, locale);
          const tooltip = t("tooltip", { name: label, count: w.value });

          return (
            <div
              key={w.name + i}
              title={tooltip}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums transition-colors",
                  isCurrent
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {w.value}
              </span>
              <span
                style={{ height: `${barHeight}px` }}
                className={cn(
                  "w-full max-w-[26px] rounded-t-[4px] transition-all",
                  isCurrent
                    ? "bg-primary"
                    : "bg-chart-muted group-hover:bg-primary/70",
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {data.map((w, i) => (
          <span
            key={w.name + i}
            className="flex-1 text-center font-sans text-[11px] text-muted-foreground truncate"
            title={seriesWeekName(w, locale)}
          >
            {seriesWeekName(w, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyRateChart: uma taxa por semana (ex.: precisão confirmada pelos analistas)
// ---------------------------------------------------------------------------

export type WeeklyRatePoint = {
  name: string;
  week?: string | null;
  value: number | null;
  numerator: number;
  denominator: number;
  low_sample: boolean;
};

/** Texto de uma taxa com os casos por trás dela ("75% · 3 de 4"). */
export function describeRate(
  point: WeeklyRatePoint,
  unit: string,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  const t = getT("alerts.charts.rate", locale);
  if (point.value === null) return t("none", { unit });
  const base = t("base", {
    percent: formatPercent(point.value, locale),
    numerator: formatNumber(point.numerator, locale),
    denominator: formatNumber(point.denominator, locale),
    unit,
  });
  return point.low_sample ? t("lowSample", { base }) : base;
}

export function WeeklyRateChart({
  data,
  unit,
  emptyText,
  emptyHint,
  currentWeekName,
}: {
  data: WeeklyRatePoint[];
  unit: string;
  emptyText: string;
  emptyHint?: string;
  currentWeekName?: string;
}) {
  const t = useTranslations("alerts.charts.rate");
  const locale = useLocale();
  const format = useFormatters();
  if (!data || data.length === 0 || data.every((w) => w.value === null)) {
    return <ChartEmptyState icon="trend" message={emptyText} hint={emptyHint} />;
  }
  const ariaLabel = data
    .map((w) => `${seriesWeekName(w, locale)}: ${describeRate(w, unit, locale)}`)
    .join("; ");

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full flex-col gap-2" style={{ minWidth: `${Math.max(data.length * 42, 0)}px` }}>
          <div
            role="img"
            aria-label={ariaLabel}
            className="flex h-[180px] items-end gap-1.5 border-b border-border pb-1"
          >
            {data.map((w, i) => {
              const isCurrent = currentWeekName
                ? w.name === currentWeekName
                : i === data.length - 1;
              const barHeight =
                w.value === null ? 0 : Math.max(4, Math.round(w.value * 135));
              return (
                <div
                  key={w.name + i}
                  title={t("weekTooltip", {
                    name: seriesWeekName(w, locale),
                    text: describeRate(w, unit, locale),
                  })}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums transition-colors",
                      w.low_sample
                        ? "text-muted-foreground"
                        : isCurrent
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    {w.value === null ? "—" : format.percent(w.value)}
                    {w.low_sample && w.value !== null ? "*" : ""}
                  </span>
                  <span
                    style={{ height: `${barHeight}px` }}
                    className={cn(
                      "w-full max-w-[26px] rounded-t-[4px] transition-all",
                      isCurrent ? "bg-primary" : "bg-chart-muted group-hover:bg-primary/70",
                    )}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5">
            {data.map((w, i) => (
              <span
                key={w.name + i}
                className="flex-1 truncate text-center font-sans text-[11px] text-muted-foreground"
                title={seriesWeekName(w, locale)}
              >
                {seriesWeekName(w, locale)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {data.some((w) => w.low_sample && w.value !== null) && (
        <p className="m-0 text-xs text-muted-foreground">
          {t("footnote", { unit })}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreHistogramChart: Distribuição da nota de risco (8 bins, "100" in signal)
// ---------------------------------------------------------------------------

export function ScoreHistogramChart({
  data,
  totalAlerts,
  emptyHint,
}: {
  data: Series[];
  totalAlerts?: number;
  emptyHint?: string;
}) {
  const t = useTranslations("alerts.charts.histogram");
  if (!data || data.length === 0) {
    return <ChartEmptyState icon="bars" message={t("empty")} hint={emptyHint} />;
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const bin100 = data.find((d) => d.name === "100");
  const n100 = bin100 ? bin100.value : 0;

  const noteText =
    n100 === 1
      ? t("tieOne")
      : n100 === 0
        ? t("tieNone")
        : t("tieMany", { count: n100 });

  const ariaLabel = t("aria", {
    top: n100,
    total: totalAlerts ?? data.reduce((s, d) => s + d.value, 0),
  });

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-[160px] items-end gap-1 border-b border-border pb-1"
      >
        {data.map((h) => {
          const isTop = h.name === "100";
          const barHeight = Math.max(4, Math.round((h.value / maxValue) * 115));
          const tooltip = isTop
            ? t("topTooltip", { count: h.value })
            : t("binTooltip", { bin: h.name, count: h.value });

          return (
            <div
              key={h.name}
              title={tooltip}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span
                className={cn(
                  "font-mono text-[11px] tabular-nums transition-colors",
                  isTop
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              >
                {h.value}
              </span>
              <span
                style={{ height: `${barHeight}px` }}
                className={cn(
                  "w-full rounded-t-[4px] transition-all",
                  isTop
                    ? "bg-signal"
                    : "bg-primary group-hover:bg-primary/80",
                )}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {data.map((h) => (
          <span
            key={h.name}
            className="flex-1 text-center font-mono text-[11px] text-muted-foreground whitespace-nowrap"
          >
            {h.name}
          </span>
        ))}
      </div>
      <p className="m-0 mt-1 text-xs text-muted-foreground">{noteText}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewProgressCard: Andamento da revisão
// ---------------------------------------------------------------------------

export function ReviewProgressCard({
  reviewed,
  total,
  statusCounts,
}: {
  reviewed: number;
  total: number;
  statusCounts: StatusCounts;
}) {
  const t = useTranslations("alerts.charts.review");
  const format = useFormatters();
  const pct = total > 0 ? (reviewed / total) * 100 : 0;
  const pctFormatted = format.percent(pct / 100);

  const statuses = [
    {
      label: t("pending"),
      value: statusCounts.pending,
      dotClass: "bg-track ring-1 ring-inset ring-muted-foreground/60",
    },
    {
      label: t("escalated"),
      value: statusCounts.escalated,
      dotClass: "bg-warning",
    },
    {
      label: t("archived"),
      value: statusCounts.archived,
      dotClass: "bg-foreground",
    },
    {
      label: t("reported"),
      value: statusCounts.reported,
      dotClass: "bg-signal",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[40px] font-medium tracking-[-0.03em] leading-none tabular-nums text-foreground">
          {format.number(reviewed)}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("ofTotal", { total: format.number(total) })}
        </span>
      </div>

      <div
        role="img"
        aria-label={t("aria", { reviewed, total, percent: pctFormatted })}
        className="h-2.5 rounded-[5px] bg-track overflow-hidden"
      >
        <span
          className="block h-full bg-primary rounded-[5px] transition-all"
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct))}%` }}
        />
      </div>

      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3.5 pt-1">
        {statuses.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 pt-2.5 border-t border-soft"
          >
            <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className={cn("size-2 rounded-full shrink-0", s.dotClass)} />
              <span>{s.label}</span>
            </dt>
            <dd className="m-0 text-xl font-medium tabular-nums text-foreground">
              {format.number(s.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HorizontalBarList: Meio de pagamento / País
// ---------------------------------------------------------------------------

export function HorizontalBarList({
  items,
  isRate = false,
  unit,
  emptyHint,
}: {
  items: Series[];
  isRate?: boolean;
  unit?: string;
  emptyHint?: string;
}) {
  const t = useTranslations("alerts.charts.bars");
  const format = useFormatters();
  if (!items || items.length === 0) {
    return <ChartEmptyState icon="bars" message={t("empty")} hint={emptyHint} />;
  }

  const maxValue = Math.max(
    ...items.map((i) => i.value),
    isRate ? 0.001 : 1,
  );

  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
      {items.map((item) => {
        const isFraction = isRate;
        const formattedVal = isFraction
          ? format.percent(item.value)
          : format.number(item.value);
        const barWidth = Math.max(
          2,
          Math.min(100, Math.round((item.value / maxValue) * 100)),
        );
        const tooltip =
          isFraction || !unit
            ? t("tooltip", { name: item.name, value: formattedVal })
            : t("tooltipUnit", { name: item.name, value: formattedVal, unit });

        return (
          <li
            key={item.name}
            title={tooltip}
            className="grid grid-cols-[140px_1fr_45px] sm:grid-cols-[150px_1fr_50px] items-center gap-3"
          >
            <span
              className="text-[13px] text-foreground truncate"
              title={item.name}
            >
              {item.name}
            </span>
            <span className="h-2 rounded-[4px] bg-track overflow-hidden">
              <span
                className="block h-full bg-primary rounded-[4px] transition-all"
                style={{ width: `${barWidth}%` }}
              />
            </span>
            <span className="font-mono text-xs text-foreground text-right tabular-nums">
              {formattedVal}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// ChartCard: Compatibility with existing callers (e.g. monitoring.tsx)
// ---------------------------------------------------------------------------

const tooltipStyle = {
  background: "var(--card)",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "12px",
  padding: "8px 12px",
  boxShadow: "none",
};

export function ChartCard({
  title,
  data,
  type = "bars",
  isRate = false,
  emptyText,
  emptyHint,
}: {
  title: string;
  data: Series[];
  type?: "area" | "bars" | "donut";
  isRate?: boolean;
  emptyText?: string;
  emptyHint?: string;
}) {
  const t = useTranslations("alerts.charts.series");
  const tb = useTranslations("alerts.charts.bars");
  const format = useFormatters();
  return (
    <section className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-4">
      <header className="flex justify-between items-baseline">
        <h2 className="text-sm font-semibold text-foreground m-0">{title}</h2>
      </header>
      {!data || data.length === 0 ? (
        <ChartEmptyState
          icon={type === "area" ? "trend" : "bars"}
          message={emptyText ?? tb("empty")}
          hint={emptyHint}
        />
      ) : (
      <div
        className="h-[250px] min-w-0"
        role="img"
        aria-label={
          title +
          ": " +
          data
            .map((d) => d.name + " " + (isRate ? format.percent(d.value) : d.value))
            .join(", ")
        }
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {type === "area" ? (
            <AreaChart data={data} margin={{ left: -25, right: 15, top: 10 }}>
              <defs>
                <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                dataKey="value"
                name={t("alerts")}
                type="monotone"
                stroke="var(--primary)"
                fill="url(#chart-area-grad)"
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : type === "donut" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={3}
                stroke="var(--card)"
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell
                    key={d.name}
                    fill={i === 0 ? "var(--primary)" : i === 1 ? "var(--chart-muted)" : "var(--track)"}
                  />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 30 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis
                type="number"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={isRate ? (value: number) => format.percent(value) : undefined}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={isRate ? (v) => format.percent(Number(v)) : undefined}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar
                dataKey="value"
                name={isRate ? t("rate") : t("alerts")}
                fill="var(--primary)"
                barSize={14}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      )}
      {type === "donut" && data.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 pt-2 text-xs text-muted-foreground border-t border-soft">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-primary" />
              <span className="truncate">{d.name}</span>
              <strong className="ml-auto font-mono text-foreground">{d.value}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
