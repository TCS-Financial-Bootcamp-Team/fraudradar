"use client";

import { ResourceError } from "@/components/ui/states";
import { WeeklyRateChart } from "@/features/alerts/components/charts";
import { formatNumber, formatPercent } from "@/lib/format";
import { useFeedbackSummary } from "../hooks/use-feedback";
import type { FeedbackSummary, Rate } from "../schemas/feedback";

function rateText(rate: Rate) {
  return rate.value === null ? "—" : formatPercent(rate.value);
}

/** As células do painel, já em texto (exportado para os testes). */
export function feedbackCells(summary: FeedbackSummary) {
  const precision = summary.confirmed_precision;
  const sample = summary.control_sample;
  const outside = sample.found_outside_queue;
  const small = (rate: Rate) => (rate.low_sample && rate.value !== null ? " · amostra pequena" : "");
  return [
    {
      label: "Precisão confirmada",
      value: rateText(precision),
      note:
        precision.value === null
          ? "nenhum alerta da fila decidido ainda"
          : `${formatNumber(precision.numerator)} de ${formatNumber(precision.denominator)} alertas da fila${small(precision)}`,
    },
    {
      label: "Lavagem fora da fila",
      value: rateText(outside),
      note:
        sample.sampled === 0
          ? "amostra de controle desligada ou sem sorteio"
          : `${formatNumber(outside.numerator)} de ${formatNumber(sample.reviewed)} revisadas · ${formatNumber(sample.sampled)} sorteadas${small(outside)}`,
    },
    {
      label: "Rótulos do retorno",
      value: formatNumber(summary.labels.total),
      note: `${formatNumber(summary.labels.laundering)} lavagem confirmada · ${formatNumber(summary.labels.false_positive)} falso positivo`,
    },
    {
      label: "Novos desde a versão ativa",
      value: formatNumber(summary.new_since_active),
      note: summary.active_version
        ? `rótulos depois do treino de ${summary.active_version}`
        : "sem versão ativa",
    },
  ];
}

export function FeedbackPanel() {
  const resource = useFeedbackSummary();

  return (
    <section
      aria-label="Retorno dos analistas"
      className="flex flex-col gap-5 rounded-[14px] border border-border bg-card p-[20px_22px]"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            Retorno dos analistas
          </h2>
          <p className="m-0 max-w-2xl text-xs text-muted-foreground">
            O que uma plataforma real consegue medir: o que os analistas
            confirmaram nos alertas e o que a amostra de controle, sorteada
            abaixo do corte, achou fora da fila. Só comunicar e arquivar como
            falso positivo confirmado viram retorno.
          </p>
        </div>
        {resource.data?.end && (
          <span className="text-xs text-muted-foreground">
            até a semana selecionada
          </span>
        )}
      </header>

      {resource.loading ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Carregando o retorno dos analistas…
        </p>
      ) : resource.error || !resource.data ? (
        <ResourceError
          message={resource.error ?? "Retorno indisponível."}
          onRetry={resource.reload}
        />
      ) : (
        <FeedbackContent summary={resource.data} />
      )}
    </section>
  );
}

function FeedbackContent({ summary }: { summary: FeedbackSummary }) {
  const labels = summary.labels;
  return (
    <>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {feedbackCells(summary).map((cell) => (
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
            Precisão confirmada por semana
          </h3>
          <WeeklyRateChart
            data={summary.weekly_confirmed_precision}
            unit="decididos"
            emptyText="Sem decisões conclusivas nos alertas da fila ainda."
          />
        </div>
        <dl className="m-0 grid grid-cols-2 content-start gap-x-6 gap-y-3 text-sm">
          {[
            ["Dos analistas", labels.analyst],
            ["Do analista simulado", labels.simulated],
            ["Na fila do modelo", labels.model],
            ["Na amostra de controle", labels.exploration],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 border-t border-soft pt-2.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="m-0 text-xl font-medium tabular-nums text-foreground">
                {formatNumber(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {labels.simulated > 0 && (
        <p className="m-0 rounded-lg bg-soft px-2.5 py-2 text-xs">
          {formatNumber(labels.simulated)} rótulos vêm do analista simulado da
          demonstração, que decide pelo gabarito: os números acima não são de
          analistas de verdade.
        </p>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        Retreino com o retorno:{" "}
        {summary.retrain.can_retrain
          ? "disponível em Configurações > Modelo."
          : summary.retrain.can_retrain_with_simulated
            ? "disponível só incluindo o retorno simulado (Configurações > Modelo)."
            : summary.retrain.reason}
      </p>
    </>
  );
}
