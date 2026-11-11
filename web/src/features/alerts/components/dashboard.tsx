"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  FileCheck2,
  Radar,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  LoadingState,
  ResourceError,
} from "@/components/ui/states";
import { HealthBadge } from "@/features/health/components/health-badge";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatShortDate,
} from "@/lib/format";
import { useAlertQueue, useMonitoring, useReplay } from "../hooks/use-alerts";
import { ChartCard } from "./charts";
import { AlertsTable } from "./alerts-table";

export function Dashboard() {
  const { week } = useAppContext();
  const monitoring = useMonitoring();
  const queue = useAlertQueue();
  const replay = useReplay();
  const heading = (
    <div className="page-heading">
      <div>
        <p className="eyebrow !mt-0 mb-2">Centro de operações</p>
        <h1>Visão geral</h1>
        <p>O que precisa da sua atenção, em um só lugar.</p>
        {week && (
          <p className="mt-1 text-xs text-muted-foreground">
            Semana de {formatShortDate(week)} ·{" "}
            <Link href="/alerts" className="underline hover:text-foreground">
              trocar na fila de alertas
            </Link>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <HealthBadge />
        <div className="grid justify-items-end gap-1">
          <Button
            disabled={replay.busy || !replay.nextRelease}
            onClick={() => void replay.advance()}
          >
            <RefreshCw className={replay.busy ? "animate-spin" : ""} />
            {replay.busy ? "Liberando…" : "Liberar próxima semana"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            {replay.nextRelease
              ? "Próxima: semana de " + formatShortDate(replay.nextRelease)
              : "Nenhuma semana processada aguardando. Rode o worker."}
          </p>
        </div>
      </div>
    </div>
  );
  if (monitoring.loading) return <LoadingState />;
  if (monitoring.data === null)
    return (
      <>
        {heading}
        <section className="panel">
          <EmptyState
            title="Nenhuma semana liberada"
            description={
              replay.nextRelease
                ? "Libere a primeira semana para ver a fila e os indicadores."
                : "Ainda não há semana processada. Rode o worker (docker compose run --rm worker backfill) e volte aqui."
            }
          />
        </section>
      </>
    );
  if (monitoring.error || !monitoring.data)
    return (
      <ResourceError
        message={monitoring.error ?? "Dados indisponíveis."}
        onRetry={monitoring.reload}
      />
    );
  const data = monitoring.data;
  const kpis = [
    {
      label: "Alertas da semana",
      value: formatNumber(data.indicators.alerts),
      hint: "Casos para análise",
      icon: Radar,
    },
    {
      label: "Alertas revisados",
      value: formatNumber(data.indicators.reviewed),
      hint: "Com decisão registrada",
      icon: CircleCheck,
    },
    {
      label: "Comunicados ao COAF",
      value: formatNumber(data.indicators.reported),
      hint: "Aprovações simuladas",
      icon: FileCheck2,
    },
    {
      label: "Taxa de alerta",
      value: formatPercent(data.indicators.alert_rate),
      hint: "Das transações processadas",
      icon: ArrowUpRight,
    },
  ];
  return (
    <>
      {heading}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, hint, icon: IconComponent }) => (
          <article key={label} className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium text-muted-foreground">
                {label}
              </h2>
              <IconComponent className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight">
              {value}
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>
          </article>
        ))}
      </div>
      <section className="panel flex flex-wrap items-center justify-between gap-5 border-l-[3px] border-l-primary p-5">
        <div className="flex items-center gap-4">
          <span className="rounded-xl bg-accent p-3 text-primary">
            <Wallet className="size-5" />
          </span>
          <div>
            <h2 className="text-xs text-muted-foreground">
              Valor total sinalizado
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {formatCurrency(data.indicators.flagged_amount)}
            </p>
          </div>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Volume financeiro vinculado aos alertas. Um sinal para investigação,
          sem presunção de ilícito.
        </p>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard
          title="Evolução de alertas · últimas semanas"
          data={data.weeks}
          type="area"
        />
        <ChartCard
          title="Distribuição por tipologia"
          data={data.typologies}
          type="donut"
        />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[1fr_2fr]">
        <ChartCard title="Países com mais alertas" data={data.countries} />
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2>Alertas recentes</h2>
            <Link
              className="flex items-center gap-2 text-xs text-primary"
              href="/alerts"
            >
              Ver fila
              <ArrowRight className="size-3" />
            </Link>
          </div>
          {queue.loading ? (
            <p className="p-6 text-sm">Carregando alertas…</p>
          ) : queue.error ? (
            <ResourceError message={queue.error} onRetry={queue.reload} />
          ) : (
            <AlertsTable items={queue.data?.items.slice(0, 5) ?? []} />
          )}
        </section>
      </div>
    </>
  );
}
