"use client";
import Link from "next/link";
import { useAppContext } from "@/components/app-context";
import {
  EmptyState,
  LoadingState,
  ResourceError,
} from "@/components/ui/states";
import { formatPercent, formatShortDate } from "@/lib/format";
import { useMonitoring } from "../hooks/use-alerts";
import { ChartCard } from "./charts";
export function MonitoringView() {
  const { week } = useAppContext();
  const resource = useMonitoring();
  if (resource.loading) return <LoadingState />;
  if (resource.data === null)
    return (
      <section className="panel">
        <EmptyState
          title="Nenhuma semana liberada"
          description="Libere uma semana na Visão geral para ver os indicadores."
        />
      </section>
    );
  if (resource.error || !resource.data)
    return (
      <ResourceError
        message={resource.error ?? "Dados indisponíveis."}
        onRetry={resource.reload}
      />
    );
  const data = resource.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Qualidade do monitoramento</p>
          <h1>Performance sob observação</h1>
          <p>Acompanhe a cobertura da fila e a qualidade das sugestões.</p>
          {week && (
            <p className="mt-1 text-xs text-muted-foreground">
              Semana de {formatShortDate(week)} ·{" "}
              <Link href="/alerts" className="underline hover:text-foreground">
                trocar na fila de alertas
              </Link>
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Recall da fila",
            value: data.indicators.recall,
            description: "Cobertura dos casos conhecidos na avaliação.",
          },
          {
            label: "Acerto de tipologia do LLM",
            value: data.indicators.typology_accuracy,
            description: "Concordância com as tipologias da avaliação.",
          },
          {
            label: "Taxa de alerta",
            value: data.indicators.alert_rate,
            description: "Proporção de transações que geraram alertas.",
          },
        ].map((metric) => (
          <article className="panel p-6" key={metric.label}>
            <h2 className="text-sm text-muted-foreground">{metric.label}</h2>
            <p className="my-5 text-4xl font-semibold tracking-tight">
              {metric.value !== null ? formatPercent(metric.value) : "—"}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {metric.description}
            </p>
          </article>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Taxa de alerta por país"
          data={data.country_rates}
          isRate
        />
        <ChartCard
          title="Taxa de alerta por meio de pagamento"
          data={data.payment_type_rates}
          isRate
        />
      </div>
      <p className="notice">
        Métricas de avaliação são calculadas pela API sobre a base de
        referência. Elas não alteram o score nem constituem uma confirmação de
        ilícito.
      </p>
    </>
  );
}
