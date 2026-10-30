"use client";
import { useState } from "react";
import { CheckCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { EmptyState, LoadingState, ResourceError } from "@/components/ui/states";
import { useReports } from "../hooks/use-alerts";
import { approvalSchema, type Report } from "../schemas/alerts";
import { formatShortDate } from "@/lib/format";

function ReportEditor({
  item,
  onApprove,
  busy,
}: {
  item: Report;
  onApprove: (id: string, content: string) => Promise<void>;
  busy: boolean;
}) {
  const [content, setContent] = useState(item.content);
  const [error, setError] = useState("");
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>{item.alert_id}</h2>
        <span className="text-xs font-normal text-muted-foreground">
          {item.status === "approved" ? "Aprovada" : "Rascunho"}
        </span>
      </div>
      <form
        className="grid gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          const validation = approvalSchema.safeParse({ content });
          if (!validation.success) {
            setError(validation.error.issues[0].message);
            return;
          }
          setError("");
          void onApprove(item.alert_id, content);
        }}
      >
        <Field label="Relato da comunicação" error={error}>
          <Textarea
            className="min-h-[400px] font-mono text-xs leading-loose"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={item.status === "approved"}
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
          disabled={busy || item.status === "approved"}
        >
          <CheckCheck />
          {busy
            ? "Aprovando…"
            : item.status === "approved"
              ? "Revisão aprovada"
              : "Aprovar rascunho"}
        </Button>
      </form>
    </section>
  );
}
export function Reports() {
  const reports = useReports();
  const [selectedId, setSelectedId] = useState("");
  if (reports.loading) return <LoadingState />;
  if (reports.error || !reports.data)
    return (
      <ResourceError
        message={reports.error ?? "Dados indisponíveis."}
        onRetry={reports.reload}
      />
    );
  const current =
    reports.data.find((r) => r.alert_id === selectedId) ?? reports.data[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Revisão e aprovação</p>
          <h1>Comunicações ao COAF</h1>
          <p>Rascunhos fundamentados, sob responsabilidade de quem revisa.</p>
        </div>
      </div>
      <p className="notice border-primary/30 bg-accent text-accent-foreground">
        <strong>Ambiente acadêmico: nada é enviado de verdade.</strong> A
        aprovação é uma simulação e não comunica operações ao COAF.
      </p>
      {!current ? (
        <section className="panel">
          <EmptyState
            title="Nenhuma comunicação nesta semana"
            description="Encaminhe um alerta para comunicação e revise o rascunho aqui."
          />
        </section>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="panel overflow-hidden">
            <h2 className="panel-title">Documentos · {reports.data.length}</h2>
            <div className="grid p-2">
              {reports.data.map((r) => (
                <button
                  aria-pressed={current.alert_id === r.alert_id}
                  key={r.alert_id}
                  onClick={() => setSelectedId(r.alert_id)}
                  className={`flex gap-3 rounded-lg p-4 text-left hover:bg-muted ${current.alert_id === r.alert_id ? "bg-accent" : ""}`}
                >
                  <FileText className="mt-1 size-4 shrink-0 text-primary" />
                  <span>
                    <strong className="text-sm">{r.alert_id}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {r.status === "approved"
                        ? "Aprovada"
                        : "Aguardando revisão"}{" "}
                      · {formatShortDate(r.updated_at)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <ReportEditor
            key={current.alert_id + current.status}
            item={current}
            onApprove={reports.approve}
            busy={reports.busy}
          />
        </div>
      )}
    </>
  );
}
