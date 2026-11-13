"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { formatCurrency } from "@/lib/format";
import {
  SCORE_HINT,
  formatDayMonth,
  formatQueuePosition,
  formatScore,
  formatWeekLabel,
  isHighRisk,
} from "@/lib/risk";
import { useAlertDetail } from "../hooks/use-alerts";
import {
  approvalSchema,
  decisionSchema,
  type ArchiveReason,
  type DecisionRequest,
  type Report,
} from "../schemas/alerts";
import { ControlSampleBadge, StatusDot, statusLabels } from "./alerts-table";
import { AccountGraph } from "./account-graph";

const decisionChoices: { value: DecisionRequest["decision"]; label: string }[] =
  [
    { value: "archive", label: "Arquivar" },
    { value: "escalate", label: "Aprofundar" },
    { value: "report", label: "Comunicar ao COAF" },
  ];

export const archiveReasonChoices: { value: ArchiveReason; label: string }[] = [
  { value: "false_positive", label: "Falso positivo confirmado" },
  { value: "insufficient_evidence", label: "Sem evidência suficiente" },
];

const cardClass = "panel grid gap-4 px-[22px] py-5";

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AlertDetailView({ id }: { id: string }) {
  const resource = useAlertDetail(id);
  const form = useForm<DecisionRequest>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: "escalate", justification: "" },
  });
  const chosen = useWatch({ control: form.control, name: "decision" });
  const reason = useWatch({ control: form.control, name: "archive_reason" });
  if (resource.loading) return <LoadingState />;
  if (resource.error || !resource.data)
    return (
      <ResourceError
        message={resource.error ?? "Alerta não encontrado."}
        onRetry={resource.reload}
      />
    );
  const { detail: alert, graph, report, otherAlerts } = resource.data;
  const isApproved = report?.status === "approved";
  const high = isHighRisk(alert.score);
  const decisionError = form.formState.errors.decision?.message;
  const reasonError = form.formState.errors.archive_reason?.message;
  const justificationError = form.formState.errors.justification?.message;

  return (
    <div className="flex flex-col gap-7">
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        href="/alerts"
      >
        <ChevronLeft className="size-3.5" strokeWidth={1.5} />
        Fila · semana de {formatWeekLabel(alert.week)}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-[3px]">
              <StatusDot status={alert.status} />
              {statusLabels[alert.status]}
            </span>
            <span className="text-muted-foreground">
              {formatQueuePosition(alert.queue_position)} · {alert.country}
            </span>
            {alert.origin === "exploration" && <ControlSampleBadge />}
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">
            Alerta {alert.id}{" "}
            <span className="font-mono text-lg font-normal tracking-normal text-muted-foreground">
              conta {alert.account}
            </span>
          </h1>
        </div>
        <dl className="grid grid-cols-3 gap-x-10 gap-y-1 tabular-nums">
          <dt className="text-xs text-muted-foreground" title={SCORE_HINT}>
            Nota de risco
          </dt>
          <dt className="text-xs text-muted-foreground">Volume na semana</dt>
          <dt className="text-xs text-muted-foreground">Movimentações</dt>
          <dd
            className={`text-[28px] font-medium tracking-[-0.02em] ${high ? "text-signal" : ""}`}
          >
            {formatScore(alert.score)}
          </dd>
          <dd className="text-[28px] font-medium tracking-[-0.02em]">
            {formatCurrency(alert.amount)}
          </dd>
          <dd className="text-[28px] font-medium tracking-[-0.02em]">
            {alert.transaction_count}
          </dd>
        </dl>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
          <section className={cardClass}>
            <CardTitle
              title="Por que entrou na fila"
              hint="peso de cada sinal na nota"
            />
            <ul className="grid gap-3.5">
              {alert.contributions.map((c) => (
                <li
                  key={c.name}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(60px,160px)_48px] items-center gap-4 text-sm"
                >
                  <span>{c.name}</span>
                  <span className="h-2 overflow-hidden rounded bg-track">
                    <span
                      className="block h-full rounded bg-primary"
                      style={{ width: `${c.value}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs">
                    {c.value}%
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={cardClass}>
            <CardTitle title="Regras acionadas" />
            {alert.rules.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Nenhuma regra de cenário acionada.
              </p>
            ) : (
              <ul className="divide-y divide-soft">
                {alert.rules.map((r) => (
                  <li key={r.code} className="flex gap-4 py-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.code}
                    </span>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel grid gap-2 px-[22px] pb-2 pt-5">
            <CardTitle title="Movimentações da semana" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-border py-2.5 pr-3 font-normal"
                    >
                      Data
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2.5 font-normal"
                    >
                      Origem → destino
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2.5 font-normal"
                    >
                      Meio
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border py-2.5 pl-3 text-right font-normal"
                    >
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {alert.movements.map((m) => (
                    <tr key={m.id} className="[&:last-child>td]:border-b-0">
                      <td className="border-b border-soft py-[13px] pr-3">
                        {formatDayMonth(m.date)}
                      </td>
                      <td className="border-b border-soft px-3 py-[13px] font-mono text-[13px]">
                        {m.sender} → {m.receiver}
                      </td>
                      <td className="border-b border-soft px-3 py-[13px]">
                        {m.payment_type}
                      </td>
                      <td className="border-b border-soft py-[13px] pl-3 text-right">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: m.currency,
                        }).format(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={cardClass}>
            <CardTitle
              title="Conexões"
              hint="até 2 saltos · contas pseudonimizadas"
            />
            <AccountGraph graph={graph} />
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <section className={cardClass}>
            <CardTitle title="Outras semanas desta conta" hint={`${otherAlerts.length} período(s)`} />
            {otherAlerts.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Esta conta não apareceu em outro período processado.
              </p>
            ) : (
              <ul className="divide-y divide-soft">
                {otherAlerts.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/alerts/${item.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-2 text-[13px] hover:underline"
                    >
                      <span>Semana de {formatWeekLabel(item.week)}</span>
                      <span className="font-mono text-xs">{formatScore(item.score)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass}>
            <CardTitle title="Parecer da IA" hint="rascunho para revisão" />
            {alert.assessment ? (
              <>
                <p className="whitespace-pre-line text-[13px] leading-relaxed">
                  {alert.assessment.content}
                </p>
                <ul className="grid gap-1.5">
                  {alert.assessment.sources.map((s) => (
                    <li
                      key={s.title}
                      className="rounded-lg bg-soft px-2.5 py-2 text-xs"
                    >
                      <span className="font-medium">{s.title}</span>{" "}
                      <span className="text-muted-foreground">
                        · {s.excerpt}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Gere uma síntese das evidências com as fontes citadas. A IA não
                decide: ela ajuda a sua leitura.
              </p>
            )}
            <Button
              variant="outline"
              disabled={resource.busy}
              onClick={() => void resource.generateAssessment()}
            >
              <Sparkles strokeWidth={1.5} />
              {resource.busy
                ? "Aguarde…"
                : alert.assessment
                  ? "Gerar novamente"
                  : "Gerar parecer"}
            </Button>
          </section>

          <section className={cardClass}>
            <CardTitle title="Decisão" />
            <form
              className="grid gap-3.5"
              onSubmit={
                isApproved
                  ? (e) => e.preventDefault()
                  : form.handleSubmit(resource.submitDecision)
              }
            >
              <div
                role="radiogroup"
                aria-label="Encaminhamento"
                className="grid grid-cols-3 overflow-hidden rounded-lg border border-border"
              >
                {decisionChoices.map((c) => {
                  const checked = chosen === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={isApproved}
                      onClick={() => {
                        form.setValue("decision", c.value, {
                          shouldValidate: true,
                        });
                        // O motivo só existe no arquivamento: some ao trocar de decisão.
                        if (c.value !== "archive")
                          form.setValue("archive_reason", undefined, {
                            shouldValidate: true,
                          });
                      }}
                      className={`min-h-11 border-r border-border px-2 py-1.5 text-[13px] font-medium leading-tight transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                        checked
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground hover:bg-soft"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {decisionError && (
                <span role="alert" className="text-xs text-signal">
                  {decisionError}
                </span>
              )}
              {chosen === "archive" && (
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-1.5 text-[13px] font-medium text-foreground">
                    Motivo do arquivamento
                  </legend>
                  <div
                    role="radiogroup"
                    aria-label="Motivo do arquivamento"
                    className="grid grid-cols-2 overflow-hidden rounded-lg border border-border"
                  >
                    {archiveReasonChoices.map((r) => {
                      const checked = reason === r.value;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          disabled={isApproved}
                          onClick={() =>
                            form.setValue("archive_reason", r.value, {
                              shouldValidate: true,
                            })
                          }
                          className={`min-h-11 border-r border-border px-2 py-1.5 text-[13px] font-medium leading-tight transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                            checked
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-foreground hover:bg-soft"
                          }`}
                        >
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="m-0 text-xs text-muted-foreground">
                    Só o falso positivo confirmado ensina o modelo no retreino.
                    Sem evidência suficiente fica fora: arquivar por falta de
                    prova não diz que a conta é inocente.
                  </p>
                  {reasonError && (
                    <span role="alert" className="text-xs text-signal">
                      {reasonError}
                    </span>
                  )}
                </fieldset>
              )}
              <Field label="Justificativa" error={justificationError}>
                <Textarea
                  rows={3}
                  maxLength={4000}
                  className="bg-background"
                  placeholder="Quais evidências sustentam a decisão?"
                  disabled={isApproved}
                  {...form.register("justification")}
                />
              </Field>
              <Button
                type="submit"
                className="h-11"
                disabled={resource.busy || isApproved}
              >
                {resource.busy ? "Registrando…" : "Registrar decisão"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {isApproved
                  ? "A comunicação deste alerta já foi aprovada; a decisão está encerrada."
                  : "Comunicar prepara um rascunho para aprovação. Nada é enviado de verdade."}
              </p>
            </form>
          </section>

          {report && (
            <ReportSection
              key={report.alert_id + report.status}
              report={report}
              onApprove={resource.approveReport}
              busy={resource.busy}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ReportSection({
  report,
  onApprove,
  busy,
}: {
  report: Report;
  onApprove: (content: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [content, setContent] = useState(report.content);
  const [error, setError] = useState("");
  const isApproved = report.status === "approved";

  return (
    <section className="panel grid gap-3 border-foreground px-[22px] py-5">
      <CardTitle
        title="Comunicação ao COAF"
        hint={isApproved ? "Aprovada" : "Rascunho"}
      />
      <p className="rounded-lg bg-soft px-2.5 py-2 text-xs">
        <strong className="font-medium">
          Simulação acadêmica: nada é enviado de verdade.
        </strong>{" "}
        A aprovação não comunica operações ao COAF.
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const validation = approvalSchema.safeParse({ content });
          if (!validation.success) {
            setError(validation.error.issues[0].message);
            return;
          }
          setError("");
          void onApprove(content);
        }}
      >
        <Field label="Relato da comunicação" error={error}>
          <Textarea
            className="min-h-[260px] bg-background font-mono text-xs leading-relaxed"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isApproved}
            readOnly={isApproved}
            maxLength={20000}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Revise fatos, evidências e justificativa. Aprovar apenas registra sua
          revisão neste ambiente.
        </p>
        <Button
          type="submit"
          variant={isApproved ? "outline" : "default"}
          className="h-11"
          disabled={busy || isApproved}
        >
          <CheckCheck strokeWidth={1.5} />
          {busy
            ? "Aprovando…"
            : isApproved
              ? "Revisão aprovada"
              : "Aprovar rascunho"}
        </Button>
      </form>
    </section>
  );
}
