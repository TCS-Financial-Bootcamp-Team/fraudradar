"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResourceError } from "@/components/ui/states";
import { formatNumber, formatPercent } from "@/lib/format";
import { useModels } from "../hooks/use-models";
import {
  jobIsOpen,
  type Job,
  type ModelMetrics,
  type ModelVersion,
} from "../schemas/models";

type MetricKey = keyof ModelMetrics;

const COLUMNS: Array<{ key: MetricKey; label: string; percent: boolean }> = [
  { key: "pr_auc", label: "PR-AUC", percent: true },
  { key: "recall_at_fpr", label: "Recall (0,13% de falso positivo)", percent: true },
  { key: "queue_recall", label: "Recall da fila", percent: true },
  { key: "innocents_per_week", label: "Inocentes por semana", percent: false },
];

function metricText(value: number | null, percent: boolean) {
  if (value === null) return "—";
  return percent ? formatPercent(value) : formatNumber(Math.round(value * 10) / 10);
}

/** Diferença para a versão ativa, em texto ("+1,2 p.p." / "−3,4"); vazio sem base de comparação. */
export function metricDelta(
  value: number | null,
  base: number | null,
  percent: boolean,
) {
  if (value === null || base === null) return "";
  const diff = percent ? (value - base) * 100 : value - base;
  if (Math.abs(diff) < 0.05) return "igual";
  const text = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(diff);
  return `${text.replace("-", "−")}${percent ? " p.p." : ""}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR").format(date);
}

function TrainingProgress({ job }: { job: Job }) {
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{job.message ?? "Treino na fila."}</span>
        <span className="font-mono tabular-nums text-foreground">
          {job.progress}%
        </span>
      </div>
      <div
        className="h-2 bg-track rounded-full overflow-hidden"
        role="progressbar"
        aria-label="Progresso do treino"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
      >
        <span
          className="block h-full rounded-full bg-primary transition-all"
          style={{ width: `${job.progress}%` }}
        />
      </div>
    </div>
  );
}

export function ModelSection() {
  const { data, error, loading, reload, job, busy, train, promote } =
    useModels();
  const [candidate, setCandidate] = useState<string | null>(null);

  if (loading && !data)
    return (
      <section aria-label="Modelo" className="panel p-6 text-sm text-muted-foreground">
        Carregando as versões do modelo…
      </section>
    );
  if (error || !data)
    return (
      <ResourceError message={error ?? "Modelo indisponível."} onRetry={reload} />
    );

  const active = data.versions.find((v) => v.active) ?? null;
  const training = job !== null && jobIsOpen(job);
  const trainDisabled = !data.can_train || training || busy;
  const failed = job !== null && job.status === "failed" ? job : null;
  const reason = training
    ? "Já existe um treino em andamento para este conjunto."
    : data.train_blocked_reason;
  const toPromote = data.versions.find((v) => v.version === candidate) ?? null;

  const row = (version: ModelVersion) => (
    <tr key={version.version} className="border-t border-soft align-top">
      <td className="py-3 pr-4">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${version.active ? "bg-primary" : "bg-track"}`}
          />
          <span className="font-mono text-xs text-foreground">
            {version.version}
          </span>
        </span>
        <span className="block pl-4 text-xs text-muted-foreground">
          {version.active ? "Ativa" : "Disponível"} ·{" "}
          {version.source === "official" ? "oficial" : "retreino"} ·{" "}
          {formatDate(version.created_at)}
        </span>
      </td>
      {COLUMNS.map(({ key, percent }) => (
        <td key={key} className="py-3 pr-4 text-right tabular-nums">
          <span className="font-mono text-xs text-foreground">
            {metricText(version.metrics[key], percent)}
          </span>
          {!version.active && active && (
            <span className="block text-xs text-muted-foreground">
              {metricDelta(version.metrics[key], active.metrics[key], percent)}
            </span>
          )}
        </td>
      ))}
      <td className="py-3 text-right">
        {!version.active && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setCandidate(version.version)}
          >
            Promover
          </Button>
        )}
      </td>
    </tr>
  );

  return (
    <section
      aria-label="Modelo"
      className="bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">Modelo</h2>
          <p className="m-0 text-xs text-muted-foreground">
            Versão ativa:{" "}
            <span className="font-mono text-foreground">
              {active?.version ?? "nenhuma"}
            </span>
            . Métricas medidas no período de teste, depois do corte no tempo.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" disabled={trainDisabled} onClick={() => void train()}>
            Treinar nova versão
          </Button>
          {trainDisabled && reason && (
            <p className="m-0 max-w-sm text-right text-xs text-muted-foreground">
              {reason}
            </p>
          )}
        </div>
      </header>

      {job && training && <TrainingProgress job={job} />}
      {failed && (
        <p role="alert" className="m-0 text-xs text-signal">
          O último treino falhou: {failed.message ?? "consulte os logs do worker."}
        </p>
      )}

      {data.versions.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">
          Nenhuma versão do modelo encontrada para este conjunto.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="pb-2 pr-4 text-left font-normal">Versão</th>
                {COLUMNS.map(({ key, label }) => (
                  <th key={key} className="pb-2 pr-4 text-right font-normal">
                    {label}
                  </th>
                ))}
                <th className="pb-2 text-right font-normal">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>{data.versions.map(row)}</tbody>
          </table>
        </div>
      )}

      {toPromote && (
        <div
          role="alertdialog"
          aria-label={`Promover ${toPromote.version}`}
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
        >
          <p className="m-0 text-sm text-foreground">
            Promover <span className="font-mono">{toPromote.version}</span> a
            versão ativa?
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            As próximas rodadas do processamento passam a dar as notas com esta
            versão. Períodos fechados não mudam: as notas e os alertas já
            gerados, e as decisões tomadas sobre eles, ficam como estão. A
            promoção fica registrada na auditoria e pode ser desfeita
            promovendo a versão anterior.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const version = toPromote.version;
                setCandidate(null);
                void promote(version);
              }}
            >
              Confirmar promoção
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCandidate(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
