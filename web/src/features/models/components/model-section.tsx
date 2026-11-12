"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResourceError } from "@/components/ui/states";
import { formatNumber, formatPercent } from "@/lib/format";
import { useModels } from "../hooks/use-models";
import { jobIsOpen, type Job } from "@/features/jobs/schemas/jobs";
import type {
  ComparisonMetrics,
  FeedbackUsage,
  ModelComparison,
  ModelVersion,
  TrainingFeedback,
  TrainRequest,
} from "../schemas/models";

type MetricKey = keyof ComparisonMetrics;

const COLUMNS: Array<{ key: MetricKey; label: string; percent: boolean }> = [
  { key: "pr_auc", label: "PR-AUC", percent: true },
  { key: "queue_recall", label: "Recall da fila", percent: true },
  { key: "queue_precision", label: "Precisão da fila", percent: true },
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

/** O resultado da trava de promoção, em uma linha. */
export function gateText(comparison: ModelComparison) {
  if (comparison.gate.passed) return "Pode ser promovida";
  const diff = comparison.recall_difference;
  if (diff === null) return comparison.gate.reason ?? "Bloqueada pela trava de promoção";
  const points = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
    Math.abs(diff) * 100,
  );
  return `Bloqueada: acha ${points} p.p. menos lavadoras na fila que a versão ativa`;
}

/** Por que a versão não pode ser promovida (a trava falhou); null quando pode. */
export function promoteBlockReason(version: ModelVersion) {
  const comparison = version.comparison;
  if (!comparison || comparison.gate.passed) return null;
  return comparison.gate.reason ?? gateText(comparison);
}

/** O retorno que a versão usou no treino, em uma linha; null quando ela não usou retorno. */
export function feedbackText(feedback: FeedbackUsage | null) {
  if (!feedback?.used || !feedback.labels) return null;
  const labels = feedback.labels;
  const parts = [
    `${formatNumber(labels.total)} rótulos no treino (${formatNumber(labels.laundering)} lavagem confirmada, ${formatNumber(labels.false_positive)} falso positivo)`,
  ];
  if (feedback.labels_in_validation)
    parts.push(`${formatNumber(feedback.labels_in_validation)} na validação, sem peso`);
  if (feedback.labels_reserved_for_test)
    parts.push(`${formatNumber(feedback.labels_reserved_for_test)} reservados para o teste`);
  if (feedback.conflicts)
    parts.push(
      `${formatNumber(feedback.conflicts)} transações em conflito com o gabarito (vale o gabarito)`,
    );
  return "Retorno: " + parts.join(" · ");
}

/** O que a escolha de treino permite: as opções e por que o treino não pode sair. */
export function trainChoiceState(
  feedback: TrainingFeedback,
  choice: TrainRequest,
) {
  const analyst = feedback.analyst.laundering + feedback.analyst.false_positive;
  const simulated = feedback.simulated.laundering + feedback.simulated.false_positive;
  const reason = !choice.use_feedback
    ? null
    : choice.include_simulated
      ? feedback.blocked_reason_with_simulated
      : feedback.blocked_reason;
  return {
    analystLabel: `Incluir o retorno dos analistas (${formatNumber(analyst)} rótulos: ${formatNumber(feedback.analyst.laundering)} lavagem confirmada, ${formatNumber(feedback.analyst.false_positive)} falso positivo confirmado)`,
    showSimulated: simulated > 0,
    simulatedLabel: `Incluir o retorno simulado (${formatNumber(simulated)} rótulos: ${formatNumber(feedback.simulated.laundering)} lavagem confirmada, ${formatNumber(feedback.simulated.false_positive)} falso positivo confirmado)`,
    // Dá para pedir o retorno se ele basta sozinho ou com o simulado.
    feedbackPossible:
      feedback.blocked_reason === null || feedback.blocked_reason_with_simulated === null,
    blockedReason: reason,
  };
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

function TrainChoice({
  feedback,
  busy,
  onTrain,
  onCancel,
}: {
  feedback: TrainingFeedback;
  busy: boolean;
  onTrain: (choice: TrainRequest) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<TrainRequest>({
    use_feedback: false,
    include_simulated: false,
  });
  const state = trainChoiceState(feedback, choice);
  return (
    <div
      role="dialog"
      aria-label="Treinar nova versão"
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
    >
      <p className="m-0 text-sm text-foreground">
        A versão nova treina com o gabarito e é comparada com a versão ativa no
        mesmo período de teste antes de poder ser promovida.
      </p>
      <label className="flex min-h-11 items-start gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-1"
          checked={choice.use_feedback}
          disabled={!state.feedbackPossible}
          onChange={(event) =>
            setChoice({
              use_feedback: event.target.checked,
              include_simulated: event.target.checked && choice.include_simulated,
            })
          }
        />
        <span>{state.analystLabel}</span>
      </label>
      {state.showSimulated && (
        <label className="flex min-h-11 items-start gap-3 pl-6 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={choice.include_simulated}
            disabled={!choice.use_feedback}
            onChange={(event) =>
              setChoice({ ...choice, include_simulated: event.target.checked })
            }
          />
          <span>{state.simulatedLabel}</span>
        </label>
      )}
      {!state.feedbackPossible && feedback.blocked_reason && (
        <p className="m-0 text-xs text-muted-foreground">{feedback.blocked_reason}</p>
      )}
      {state.blockedReason && (
        <p role="alert" className="m-0 text-xs text-signal">
          {state.blockedReason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || state.blockedReason !== null}
          onClick={() => onTrain(choice)}
        >
          Treinar
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function ModelSection() {
  const { data, error, loading, reload, job, busy, train, promote } =
    useModels();
  const [candidate, setCandidate] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

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

  const metricCell = (version: ModelVersion, key: MetricKey, percent: boolean) => {
    const comparison = version.active ? null : version.comparison;
    const own = comparison ? comparison.candidate[key] : version.metrics[key];
    return (
      <td key={key} className="py-3 pr-4 text-right tabular-nums">
        <span className="font-mono text-xs text-foreground">
          {metricText(own, percent)}
        </span>
        {comparison ? (
          <span className="block text-xs text-muted-foreground">
            ativa {metricText(comparison.active[key], percent)} ·{" "}
            {metricDelta(own, comparison.active[key], percent)}
          </span>
        ) : (
          !version.active &&
          active && (
            <span
              className="block text-xs text-muted-foreground"
              title="Ficha antiga, sem comparação no mesmo período: a diferença compara períodos de teste diferentes."
            >
              {metricDelta(own, active.metrics[key], percent)}
            </span>
          )
        )}
      </td>
    );
  };

  const row = (version: ModelVersion) => {
    const blocked = promoteBlockReason(version);
    const usage = feedbackText(version.feedback);
    const comparison = version.active ? null : version.comparison;
    return (
      <tr key={version.version} className="border-t border-soft align-top">
        <td className="py-3 pr-4">
          <span className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${version.active ? "bg-primary" : "bg-track"}`}
            />
            <span className="font-mono text-xs text-foreground">
              {version.version}
            </span>
            {version.feedback?.used && version.feedback.include_simulated && (
              <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground">
                retorno simulado
              </span>
            )}
          </span>
          <span className="block pl-4 text-xs text-muted-foreground">
            {version.active ? "Ativa" : "Disponível"} ·{" "}
            {version.source === "official" ? "oficial" : "retreino"} ·{" "}
            {formatDate(version.created_at)}
            {version.train_end ? ` · treino até ${formatDate(version.train_end)}` : ""}
          </span>
          {comparison && (
            <span
              className={`block pl-4 text-xs ${comparison.gate.passed ? "text-muted-foreground" : "text-signal"}`}
            >
              {gateText(comparison)} · comparada com {comparison.active_version}
              {comparison.period.start
                ? ` em ${comparison.period.weeks} semanas desde ${formatDate(comparison.period.start)}`
                : ""}
            </span>
          )}
          {usage && (
            <span className="block max-w-md pl-4 text-xs text-muted-foreground">
              {usage}
            </span>
          )}
        </td>
        {COLUMNS.map(({ key, percent }) => metricCell(version, key, percent))}
        <td className="py-3 text-right">
          {!version.active && (
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || blocked !== null}
                title={blocked ?? undefined}
                onClick={() => setCandidate(version.version)}
              >
                Promover
              </Button>
              {blocked && <span className="sr-only">{blocked}</span>}
            </div>
          )}
        </td>
      </tr>
    );
  };

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
            .
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            disabled={trainDisabled || choosing}
            onClick={() => setChoosing(true)}
          >
            Treinar nova versão
          </Button>
          {trainDisabled && reason && (
            <p className="m-0 max-w-sm text-right text-xs text-muted-foreground">
              {reason}
            </p>
          )}
        </div>
      </header>

      {choosing && !trainDisabled && (
        <TrainChoice
          feedback={data.training_feedback}
          busy={busy}
          onCancel={() => setChoosing(false)}
          onTrain={(choice) => {
            setChoosing(false);
            void train(choice);
          }}
        />
      )}
      {job && training && <TrainingProgress job={job} />}
      {failed && (
        <p role="alert" className="m-0 text-xs text-signal">
          O último treino falhou: {failed.message ?? "consulte os logs do worker."}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-[13px] font-medium text-foreground">
          Validação no período de teste (dados rotulados)
        </h3>
        <p className="m-0 text-xs text-muted-foreground">
          Medidas contra o gabarito nas semanas de teste, depois do corte no
          tempo, para decidir a promoção. Cada versão nova aparece ao lado da
          versão ativa medida nas mesmas semanas. Estas métricas não aparecem
          nas telas de operação: lá não existe gabarito.
        </p>
      </div>

      {data.versions.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">
          Nenhuma versão do modelo encontrada para este conjunto.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
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
