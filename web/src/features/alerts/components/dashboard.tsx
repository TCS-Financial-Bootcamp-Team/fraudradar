"use client";

import Link from "next/link";
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
import {
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { formatScore } from "@/lib/risk";
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

export function formatWeekPeriod(weekStr: string): string {
  const parts = weekStr.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return `Semana de ${weekStr}`;
  const [year, month, day] = parts;
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start.getTime() + 6 * 86400000);
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const startDay = String(start.getUTCDate()).padStart(2, "0");
  const startMonth = months[start.getUTCMonth()];
  const endDay = String(end.getUTCDate()).padStart(2, "0");
  const endMonth = months[end.getUTCMonth()];
  const endYear = end.getUTCFullYear();

  return `Semana de ${startDay} ${startMonth} a ${endDay} ${endMonth} ${endYear}`;
}

/** O indicador "Precisão confirmada": alertas da fila confirmados como lavagem ÷ alertas da fila
 * com decisão conclusiva, até a semana em exibição. */
export function confirmedPrecisionKpi(summary: FeedbackSummary | null | undefined) {
  const rate = summary?.confirmed_precision;
  if (!rate || rate.value === null)
    return { value: "—", note: "sem decisões ainda", spark: [] as number[] };
  const lowSample = rate.low_sample ? " · amostra pequena" : "";
  return {
    value: formatPercent(rate.value),
    note: `${formatNumber(rate.numerator)} de ${formatNumber(rate.denominator)} decididos${lowSample}`,
    spark: (summary?.weekly_confirmed_precision ?? [])
      .filter((w) => w.value !== null)
      .map((w) => (w.value ?? 0) * 100),
  };
}

const STATUS_CONFIG: Record<
  AlertStatus,
  { label: string; dotClass: string }
> = {
  pending: {
    label: "Pendente",
    dotClass: "bg-track ring-1 ring-inset ring-muted-foreground/60",
  },
  escalated: {
    label: "Em investigação",
    dotClass: "bg-warning",
  },
  archived: {
    label: "Arquivado",
    dotClass: "bg-foreground",
  },
  reported: {
    label: "Para comunicação",
    dotClass: "bg-signal",
  },
};

// ---------------------------------------------------------------------------
// Dashboard Component
// ---------------------------------------------------------------------------

export function Dashboard() {
  const { week } = useAppContext();
  const monitoring = useMonitoring();
  const queue = useAlertQueue();
  const feedback = useFeedbackSummary();

  const weekRangeText = week ? formatWeekPeriod(week) : "";

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13px] text-muted-foreground">
          {weekRangeText ? `${weekRangeText} · ` : ""}
          <Link
            href="/alerts"
            className="text-foreground underline underline-offset-[3px] decoration-border hover:decoration-foreground"
          >
            trocar na fila
          </Link>
        </p>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          Visão geral
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
            title="Nenhum período processado"
            description="Use Processar agora depois de carregar transações no conjunto."
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
          message={monitoring.error ?? "Dados indisponíveis."}
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
      if (diff > 0) return `+${diff} vs. semana anterior`;
      if (diff < 0) return `${diff} vs. semana anterior`;
      return "= vs. semana anterior";
    }
    return "casos para análise";
  })();

  const weekValues = data.weeks.map((w) => w.value);
  const precision = feedback.loading
    ? { value: "…", note: "carregando o retorno", spark: [] as number[] }
    : confirmedPrecisionKpi(feedback.data);

  const kpis = [
    {
      label: "Alertas na semana",
      value: formatNumber(data.indicators.alerts),
      note: alertDiffNote,
      spark: weekValues,
      sparkLabel: "Alertas na semana: evolução nas últimas semanas",
    },
    {
      label: "Taxa de alerta",
      value: formatPercent(data.indicators.alert_rate),
      note: "das transações processadas",
      spark: weekValues,
      sparkLabel: "Taxa de alerta: evolução nas últimas semanas",
    },
    {
      label: "Valor sinalizado",
      value: formatCurrency(data.indicators.flagged_amount),
      note: "volume financeiro",
      spark: weekValues,
      sparkLabel: "Valor sinalizado: evolução nas últimas semanas",
    },
    {
      label: "Precisão confirmada",
      value: precision.value,
      note: precision.note,
      spark: precision.spark,
      sparkLabel: "Precisão confirmada pelos analistas: evolução por semana",
    },
  ];

  const topAlerts = queue.data?.items.slice(0, 5) ?? [];

  return (
    <div className="flex flex-col gap-9 max-w-[1320px] w-full">
      {heading}

      {/* KPI Strip */}
      <section
        aria-label="Indicadores da semana"
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
              Alertas por semana
            </h2>
            <span className="text-xs text-muted-foreground">
              últimas {data.weeks.length} semanas
            </span>
          </header>
          <WeeklyAlertsChart data={data.weeks} />
        </article>

        {/* Card 2: Precisão confirmada pelos analistas */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-[18px]">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              Precisão confirmada
            </h2>
            <span className="text-xs text-muted-foreground">
              alertas da fila confirmados como lavagem
            </span>
          </header>
          {feedback.error ? (
            <ResourceError message={feedback.error} onRetry={feedback.reload} />
          ) : (
            <WeeklyRateChart
              data={feedback.data?.weekly_confirmed_precision ?? []}
              unit="decididos"
              emptyText={
                feedback.loading
                  ? "Carregando o retorno dos analistas…"
                  : "Sem decisões dos analistas ainda. Arquivar como falso positivo ou comunicar alimenta este gráfico."
              }
            />
          )}
        </article>

        {/* Card 3: Distribuição da nota de risco */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-[18px]">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              Distribuição da nota de risco
            </h2>
            <span className="text-xs text-muted-foreground">
              {data.indicators.alerts} alertas da semana
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
              Andamento da revisão
            </h2>
            <span className="text-xs text-muted-foreground">esta semana</span>
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
              Meio de pagamento
            </h2>
            <span className="text-xs text-muted-foreground">
              alertas por meio predominante
            </span>
          </header>
          <HorizontalBarList items={data.payment_type_rates} isRate={true} />
        </article>

        {/* Card 6: País */}
        <article className="rounded-[14px] border border-border bg-card p-[20px_22px] flex flex-col gap-4">
          <header className="flex justify-between items-baseline gap-3">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              País
            </h2>
            <span className="text-xs text-muted-foreground">
              {formatCurrency(data.indicators.flagged_amount)} sinalizados
            </span>
          </header>
          <HorizontalBarList items={data.countries} unit="alertas" />
        </article>
      </section>

      {/* Comece por aqui: Top 5 da fila */}
      <section className="rounded-[14px] border border-border bg-card p-[20px_22px_12px] flex flex-col gap-3">
        <header className="flex justify-between items-baseline">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            Comece por aqui
          </h2>
          <Link
            href="/alerts"
            className="text-[13px] text-foreground underline underline-offset-[3px] decoration-border hover:decoration-foreground"
          >
            Ver fila completa →
          </Link>
        </header>

        {queue.loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Carregando alertas…
          </p>
        ) : queue.error ? (
          <ResourceError message={queue.error} onRetry={queue.reload} />
        ) : topAlerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum alerta nesta semana.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse tabular-nums text-left text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="font-normal py-2.5 pr-3">
                    Pos.
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    Alerta
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    Conta
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    Nota de risco
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3">
                    País
                  </th>
                  <th scope="col" className="font-normal py-2.5 px-3 text-right">
                    Valor
                  </th>
                  <th scope="col" className="font-normal py-2.5 pl-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {topAlerts.map((alert) => {
                  const cfg = STATUS_CONFIG[alert.status] ?? {
                    label: alert.status,
                    dotClass: "bg-muted-foreground",
                  };
                  return (
                    <tr
                      key={alert.id}
                      className="relative cursor-pointer border-b border-soft transition-colors hover:bg-soft/40 focus-within:bg-soft/40"
                    >
                      <td className="py-3.5 pr-3 font-mono text-xs text-muted-foreground">
                        {alert.queue_position}º
                      </td>
                      <td className="py-3.5 px-3">
                        <Link
                          href={`/alerts/${alert.id}`}
                          aria-label={getAlertLinkLabel(alert)}
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
                            {formatScore(alert.score)}
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
                        {formatCurrency(alert.amount)}
                      </td>
                      <td className="py-3.5 pl-3">
                        <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]">
                          <span
                            className={cn(
                              "size-2 rounded-full shrink-0",
                              cfg.dotClass,
                            )}
                          />
                          <span>{cfg.label}</span>
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
