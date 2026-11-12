"use client";

import Link from "next/link";
import { useAppContext } from "@/components/app-context";
import {
  EmptyState,
  LoadingState,
  ResourceError,
} from "@/components/ui/states";
import { formatPercent, formatShortDate } from "@/lib/format";
import { ModelSection } from "@/features/models/components/model-section";
import { useMonitoring } from "../hooks/use-alerts";

// Threshold para destacar taxa de alerta como sinal de risco:
// Em AML no SAML-D, taxas de alerta acima de 3,0% indicam concentração de risco.
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
  const percentWidth = Math.min(
    100,
    Math.max(2, maxVal > 0 ? (value / maxVal) * 100 : 0)
  );
  const isSignal = value >= SIGNAL_RATE_THRESHOLD;

  return (
    <li
      className="grid grid-cols-[150px_minmax(0,1fr)_52px] items-center gap-3 text-sm"
      title={`${name}: ${formatPercent(value)}`}
    >
      <span className="truncate text-foreground" title={name}>
        {name}
      </span>
      <span className="h-2 bg-track rounded-full overflow-hidden">
        <span
          className={`block h-full rounded-full transition-all ${
            isSignal ? "bg-signal" : "bg-primary"
          }`}
          style={{ width: `${percentWidth}%` }}
        />
      </span>
      <span className="font-mono text-xs text-right tabular-nums text-foreground">
        {formatPercent(value)}
      </span>
    </li>
  );
}

function RateCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Array<{ name: string; value: number }>;
}) {
  const maxVal = Math.max(...items.map((r) => r.value), 0.01);

  return (
    <article className="bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-4 min-w-0">
      <header className="flex justify-between items-baseline gap-3">
        <h2 className="m-0 text-sm font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </header>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          Nenhum dado disponível.
        </p>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-[11px]">
          {items.map((r) => (
            <HorizontalRateBar
              key={r.name}
              name={r.name}
              value={r.value}
              maxVal={maxVal}
            />
          ))}
        </ul>
      )}
    </article>
  );
}

export function MonitoringView() {
  const { week } = useAppContext();
  const resource = useMonitoring();

  if (resource.loading) return <LoadingState />;

  if (resource.data === null)
    return (
      <div className="flex flex-col gap-7">
        <section className="panel">
          <EmptyState
            title="Nenhuma semana liberada"
            description="Libere uma semana na Visão geral para ver os indicadores."
          />
        </section>
        <ModelSection />
      </div>
    );

  if (resource.error || !resource.data)
    return (
      <ResourceError
        message={resource.error ?? "Dados indisponíveis."}
        onRetry={resource.reload}
      />
    );

  const data = resource.data;

  // Recall: null ou ausente mostra "—" com "sem gabarito nesta semana"
  const recallDisplay =
    data.indicators.recall === null || data.indicators.recall === undefined
      ? { value: "—", note: "sem gabarito nesta semana" }
      : {
          value: formatPercent(data.indicators.recall),
          note: "cobertura dos casos conhecidos",
        };

  // Acerto de tipologia: null, ausente ou exatamente 0 mostra "—" com "aguarda o parecer da IA"
  const typologyDisplay =
    data.indicators.typology_accuracy === null ||
    data.indicators.typology_accuracy === undefined ||
    data.indicators.typology_accuracy === 0
      ? { value: "—", note: "aguarda o parecer da IA" }
      : {
          value: formatPercent(data.indicators.typology_accuracy),
          note: "concordância com as tipologias",
        };

  // Taxa de alerta
  const alertRateDisplay =
    data.indicators.alert_rate !== null &&
    data.indicators.alert_rate !== undefined
      ? {
          value: formatPercent(data.indicators.alert_rate),
          note: "alertas ÷ contas ativas",
        }
      : { value: "—", note: "alertas ÷ contas ativas" };

  // Indicador de volume/contagem de alertas no lote
  const alertsCountDisplay = {
    value: data.indicators.alerts.toLocaleString("pt-BR"),
    note: "contas sinalizadas no lote",
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        {week && (
          <p className="m-0 text-[13px] text-muted-foreground">
            Semana de {formatShortDate(week)} ·{" "}
            <Link
              href="/alerts"
              className="text-foreground underline underline-offset-[3px] decoration-border hover:decoration-foreground"
            >
              trocar na fila
            </Link>
          </p>
        )}
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          Monitoramento
        </h1>
        <p className="m-0 text-sm text-muted-foreground">
          Qualidade da fila medida contra o gabarito do SAML-D, depois que o
          modelo já deu as notas.
        </p>
      </div>

      <section
        aria-label="Indicadores de qualidade"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border rounded-[14px] overflow-hidden"
      >
        {[
          { label: "Recall da fila", ...recallDisplay },
          { label: "Acerto de tipologia", ...typologyDisplay },
          { label: "Taxa de alerta", ...alertRateDisplay },
          { label: "Alertas no lote", ...alertsCountDisplay },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-card p-[18px_20px] flex flex-col gap-1"
          >
            <span className="text-[13px] text-muted-foreground">{k.label}</span>
            <span className="text-[32px] font-medium tracking-tight leading-[1.1] tabular-nums font-mono text-foreground">
              {k.value}
            </span>
            <span className="text-xs text-muted-foreground">{k.note}</span>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RateCard
          title="Taxa de alerta por país"
          subtitle="alertas ÷ contas ativas"
          items={data.country_rates}
        />
        <RateCard
          title="Taxa de alerta por meio de pagamento"
          subtitle="alertas ÷ contas ativas"
          items={data.payment_type_rates}
        />
      </section>

      <ModelSection />

      <p className="m-0 text-xs text-muted-foreground">
        O gabarito só entra depois da fila pronta, para medir. O modelo nunca o
        lê.
      </p>
    </div>
  );
}
