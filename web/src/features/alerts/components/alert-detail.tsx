"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { Chat } from "@/features/assistant/components/assistant";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { useAlertDetail } from "../hooks/use-alerts";
import {
  approvalSchema,
  decisionSchema,
  type DecisionRequest,
  type Report,
} from "../schemas/alerts";
import { RiskScore, statusLabels } from "./alerts-table";
import { SCORE_HINT, formatQueuePosition } from "@/lib/risk";
import { AccountGraph } from "./account-graph";

export function AlertDetailView({ id }: { id: string }) {
  const resource = useAlertDetail(id);
  const form = useForm<DecisionRequest>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: "escalate", justification: "" },
  });
  if (resource.loading) return <LoadingState />;
  if (resource.error || !resource.data)
    return (
      <ResourceError
        message={resource.error ?? "Alerta não encontrado."}
        onRetry={resource.reload}
      />
    );
  const { detail: alert, graph, report } = resource.data;
  const isApproved = report?.status === "approved";
  return (
    <>
      <Link
        className="flex w-fit items-center gap-2 text-xs text-muted-foreground hover:text-primary"
        href="/alerts"
      >
        <ArrowLeft className="size-3" />
        Voltar para a fila
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Dossiê de investigação</p>
          <h1>
            {alert.id}{" "}
            <span className="font-normal text-muted-foreground">
              / {alert.account}
            </span>
          </h1>
          <p>
            {alert.country} · Semana de {formatShortDate(alert.week)} ·{" "}
            {statusLabels[alert.status]}
          </p>
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <section className="panel grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <p className="eyebrow mb-3">Nota de risco</p>
              <RiskScore value={alert.score} />
              <p className="mt-2 text-xs text-muted-foreground">
                {formatQueuePosition(alert.queue_position)} · {alert.typology}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {SCORE_HINT}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3">Volume sinalizado</p>
              <p className="text-xl font-semibold">
                {formatCurrency(alert.amount)}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-3">Movimentações</p>
              <p className="text-xl font-semibold">{alert.transaction_count}</p>
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">O que contribuiu para a nota</h2>
            <div className="grid gap-5 p-6">
              {alert.contributions.map((c) => (
                <div key={c.name}>
                  <div className="mb-2 flex justify-between gap-4 text-xs">
                    <span>{c.name}</span>
                    <strong>{c.value}%</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: c.value + "%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">Regras acionadas</h2>
            <ul className="divide-y px-6">
              {alert.rules.map((r) => (
                <li key={r.code} className="flex gap-4 py-4 text-sm">
                  <span className="font-mono text-xs text-primary">
                    {r.code}
                  </span>
                  <span>{r.description}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel overflow-hidden">
            <div className="panel-title">
              <h2>Conexões da conta</h2>
              <span className="text-xs font-normal text-muted-foreground">
                Até 2 saltos · pseudonimizado
              </span>
            </div>
            <AccountGraph graph={graph} />
          </section>
          <section className="panel overflow-hidden">
            <h2 className="panel-title">Transações vinculadas</h2>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Origem → destino</th>
                    <th>Valor</th>
                    <th>Meio</th>
                  </tr>
                </thead>
                <tbody>
                  {alert.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{formatShortDate(m.date)}</td>
                      <td className="font-mono text-xs">
                        {m.sender} → {m.receiver}
                      </td>
                      <td>
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: m.currency,
                        }).format(m.amount)}
                      </td>
                      <td>{m.payment_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Parecer assistido por IA</h2>
              <Button
                size="sm"
                variant="outline"
                disabled={resource.busy}
                onClick={() => void resource.generateAssessment()}
              >
                <Sparkles />
                {resource.busy
                  ? "Aguarde…"
                  : alert.assessment
                    ? "Gerar novamente"
                    : "Gerar parecer"}
              </Button>
            </div>
            <div className="p-6">
              {alert.assessment ? (
                <>
                  <p className="whitespace-pre-line text-sm leading-relaxed">
                    {alert.assessment.content}
                  </p>
                  <ul className="mt-6 space-y-4 border-t pt-5">
                    {alert.assessment.sources.map((s) => (
                      <li key={s.title} className="text-xs">
                        <strong>{s.title}</strong>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                          {s.excerpt}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Gere uma síntese das evidências com fontes para apoiar sua
                  revisão.
                </p>
              )}
            </div>
          </section>
          <section className="panel">
            <h2 className="panel-title">Registrar decisão</h2>
            <form
              className="grid gap-5 p-6"
              onSubmit={
                isApproved
                  ? (e) => e.preventDefault()
                  : form.handleSubmit(resource.submitDecision)
              }
            >
              <Field
                label="Encaminhamento"
                error={form.formState.errors.decision?.message}
              >
                <Select disabled={isApproved} {...form.register("decision")}>
                  <option value="escalate">Aprofundar investigação</option>
                  <option value="archive">Arquivar alerta</option>
                  <option value="report">Preparar comunicação ao COAF</option>
                </Select>
              </Field>
              <Field
                label="Justificativa obrigatória"
                error={form.formState.errors.justification?.message}
              >
                <Textarea
                  maxLength={4000}
                  placeholder="Descreva as evidências e o motivo da decisão…"
                  disabled={isApproved}
                  {...form.register("justification")}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Comunicar prepara um rascunho para aprovação. Nada é enviado de
                verdade.
              </p>
              <Button
                type="submit"
                className="justify-self-start"
                disabled={resource.busy || isApproved}
              >
                {resource.busy ? "Registrando…" : "Registrar decisão"}
              </Button>
              {isApproved && (
                <p className="text-xs text-muted-foreground">
                  A comunicação deste alerta já foi aprovada; a decisão está
                  encerrada.
                </p>
              )}
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
        </div>
        <section className="panel flex h-[640px] flex-col overflow-hidden xl:sticky xl:top-24">
          <h2 className="panel-title">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Converse sobre este caso
            </span>
          </h2>
          <Chat key={id} alertId={id} />
        </section>
      </div>
    </>
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
    <section className="panel">
      <div className="panel-title">
        <h2>Comunicação ao COAF</h2>
        <span className="text-xs font-normal text-muted-foreground">
          {isApproved ? "Aprovada" : "Rascunho"}
        </span>
      </div>
      <div className="grid gap-5 p-6">
        <p className="notice border-primary/30 bg-accent text-accent-foreground">
          <strong>Ambiente acadêmico: nada é enviado de verdade.</strong> A
          aprovação é uma simulação e não comunica operações ao COAF.
        </p>
        <form
          className="grid gap-5"
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
              className="min-h-[280px] font-mono text-xs leading-loose"
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
            className="justify-self-start"
            disabled={busy || isApproved}
          >
            <CheckCheck />
            {busy
              ? "Aprovando…"
              : isApproved
                ? "Revisão aprovada"
                : "Aprovar rascunho"}
          </Button>
        </form>
      </div>
    </section>
  );
}
