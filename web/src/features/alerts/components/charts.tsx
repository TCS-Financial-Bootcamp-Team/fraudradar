"use client";

import * as React from "react";
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
import { cn } from "cn";
import { formatNumber, formatPercent } from "@/lib/format";
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
      aria-label={label ?? "Evolução nas semanas"}
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
}: {
  data: Series[];
  currentWeekName?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
        Nenhum dado de alertas por semana.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const ariaLabel = `Alertas por semana: ${data.map((d) => `${d.name}: ${d.value}`).join(", ")}.`;

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
          const tooltip = `Semana de ${w.name}: ${w.value} alertas`;

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
            title={w.name}
          >
            {w.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QueueRecallChart: Recall da fila (line chart with 95% signal target line)
// ---------------------------------------------------------------------------

export function QueueRecallChart({
  data,
  currentWeekRecall,
}: {
  data: Series[];
  currentWeekRecall?: number | null;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[210px] flex-col items-center justify-center gap-1.5 text-center text-muted-foreground">
        <p className="text-sm font-medium text-foreground">Sem dados de recall</p>
        <p className="text-xs">
          Nenhuma semana com gabarito liberada até o momento.
        </p>
      </div>
    );
  }

  // Values normalized to 0-100 scale
  const values = data.map((d) => (d.value <= 1 ? d.value * 100 : d.value));
  const count = values.length;

  // Chart coordinates in 640x200 viewBox
  const xs = (i: number) => (count <= 1 ? 320 : 40 + (i / (count - 1)) * 590);
  const ys = (v: number) => {
    // scale from 80% (y=180) to 100% (y=10)
    const clamped = Math.max(80, Math.min(100, v));
    return 10 + ((100 - clamped) / 20) * 170;
  };

  const pts = values.map((v, i) => ({
    x: xs(i),
    y: ys(v),
    val: v,
    name: data[i].name,
  }));

  const linePath = pts
    .map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
    .join(" ");

  const lastPt = pts[pts.length - 1];
  const firstPt = pts[0];
  const areaPath = `${linePath} L${lastPt.x.toFixed(1)} 180 L${firstPt.x.toFixed(1)} 180 Z`;

  const lastPercentFormatted = formatPercent(lastPt.val / 100);
  const ariaLabel = `Recall da fila por semana: última semana com ${lastPercentFormatted}; meta de 95%.`;

  return (
    <div className="flex flex-col gap-1.5">
      <svg
        viewBox="0 0 640 200"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full overflow-visible"
      >
        {/* Horizontal grid lines */}
        <line x1="40" x2="630" y1="10" y2="10" stroke="var(--border)" />
        <line x1="40" x2="630" y1="95" y2="95" stroke="var(--border)" />
        <line x1="40" x2="630" y1="180" y2="180" stroke="var(--border)" />

        {/* 95% target line */}
        <line
          x1="40"
          x2="630"
          y1="52.5"
          y2="52.5"
          stroke="var(--signal)"
          strokeDasharray="4 4"
        />
        <text
          x="630"
          y="46"
          textAnchor="end"
          className="font-sans text-[11px] fill-muted-foreground"
        >
          meta de 95%
        </text>

        {/* Y axis numbers */}
        <text
          x="32"
          y="14"
          textAnchor="end"
          className="font-mono text-[11px] fill-muted-foreground"
        >
          100
        </text>
        <text
          x="32"
          y="99"
          textAnchor="end"
          className="font-mono text-[11px] fill-muted-foreground"
        >
          90
        </text>
        <text
          x="32"
          y="184"
          textAnchor="end"
          className="font-mono text-[11px] fill-muted-foreground"
        >
          80
        </text>

        {/* Line & Area */}
        <path d={areaPath} fill="var(--primary)" fillOpacity="0.07" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover spots on points */}
        {pts.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x.toFixed(1)}
            cy={pt.y.toFixed(1)}
            r="8"
            className="fill-transparent hover:fill-primary/20 cursor-pointer"
          >
            <title>{`${pt.name}: ${formatPercent(pt.val / 100)}`}</title>
          </circle>
        ))}

        {/* Last point circle and callout */}
        <circle
          cx={lastPt.x.toFixed(1)}
          cy={lastPt.y.toFixed(1)}
          r="4.5"
          fill="var(--primary)"
          stroke="var(--card)"
          strokeWidth="2"
        />
        <text
          x={lastPt.x.toFixed(1)}
          y={(Math.min(160, lastPt.y + 22)).toFixed(1)}
          textAnchor="end"
          className="font-mono text-[12px] font-medium fill-foreground"
        >
          {lastPercentFormatted}
        </text>
      </svg>

      {/* X axis milestones */}
      <div className="flex justify-between pl-[6.2%] pr-[1.6%] text-[11px] text-muted-foreground pt-1">
        <span>{data[0]?.name}</span>
        {data.length > 3 && <span>{data[Math.floor(data.length / 3)]?.name}</span>}
        {data.length > 3 && (
          <span>{data[Math.floor((2 * data.length) / 3)]?.name}</span>
        )}
        <span>{data[data.length - 1]?.name}</span>
      </div>

      <p className="m-0 mt-2 text-xs text-muted-foreground">
        {currentWeekRecall === null
          ? "A semana atual veio da ingestão e não tem gabarito."
          : `Última semana com gabarito: ${lastPercentFormatted}.`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreHistogramChart: Distribuição da nota de risco (8 bins, "100" in signal)
// ---------------------------------------------------------------------------

export function ScoreHistogramChart({
  data,
  totalAlerts,
}: {
  data: Series[];
  totalAlerts?: number;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
        Nenhum dado de distribuição de nota.
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const bin100 = data.find((d) => d.name === "100");
  const n100 = bin100 ? bin100.value : 0;

  const noteText =
    n100 === 1
      ? "1 alerta empata em 100: quem desempata é a posição na fila."
      : n100 === 0
        ? "Nenhum alerta com nota 100 nesta semana."
        : `${n100} alertas empatam em 100: quem desempata é a posição na fila.`;

  const ariaLabel = `Distribuição da nota de risco: ${n100} alertas com nota 100 de um total de ${totalAlerts ?? data.reduce((s, d) => s + d.value, 0)}.`;

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
          const tooltip = `${isTop ? "Nota 100" : `Nota a partir de ${h.name}`}: ${h.value} alertas`;

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
  const pct = total > 0 ? (reviewed / total) * 100 : 0;
  const pctFormatted = formatPercent(pct / 100);

  const statuses = [
    {
      label: "Pendentes",
      value: statusCounts.pending,
      dotClass: "bg-track ring-1 ring-inset ring-muted-foreground/60",
    },
    {
      label: "Em investigação",
      value: statusCounts.escalated,
      dotClass: "bg-warning",
    },
    {
      label: "Arquivados",
      value: statusCounts.archived,
      dotClass: "bg-foreground",
    },
    {
      label: "Para comunicação",
      value: statusCounts.reported,
      dotClass: "bg-signal",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[40px] font-medium tracking-[-0.03em] leading-none tabular-nums text-foreground">
          {formatNumber(reviewed)}
        </span>
        <span className="text-sm text-muted-foreground">
          de {formatNumber(total)} alertas com decisão
        </span>
      </div>

      <div
        role="img"
        aria-label={`${reviewed} de ${total} alertas revisados, ${pctFormatted}.`}
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
              {formatNumber(s.value)}
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
  unit = "alertas",
}: {
  items: Series[];
  isRate?: boolean;
  unit?: string;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        Nenhum registro para esta categoria.
      </div>
    );
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
          ? formatPercent(item.value)
          : formatNumber(item.value);
        const barWidth = Math.max(
          2,
          Math.min(100, Math.round((item.value / maxValue) * 100)),
        );
        const tooltip = `${item.name}: ${formattedVal} ${isFraction ? "" : unit}`.trim();

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
}: {
  title: string;
  data: Series[];
  type?: "area" | "bars" | "donut";
  isRate?: boolean;
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-4">
      <header className="flex justify-between items-baseline">
        <h2 className="text-sm font-semibold text-foreground m-0">{title}</h2>
      </header>
      <div
        className="h-[250px] min-w-0"
        role="img"
        aria-label={
          title +
          ": " +
          data
            .map((d) => d.name + " " + (isRate ? formatPercent(d.value) : d.value))
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
                name="Alertas"
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
                tickFormatter={isRate ? formatPercent : undefined}
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
                formatter={isRate ? (v) => formatPercent(Number(v)) : undefined}
                cursor={{ fill: "var(--muted)" }}
              />
              <Bar
                dataKey="value"
                name={isRate ? "Taxa" : "Alertas"}
                fill="var(--primary)"
                barSize={14}
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {type === "donut" && (
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
