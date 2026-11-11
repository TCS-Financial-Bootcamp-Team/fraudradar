"use client";

import { useState } from "react";
import { Plus, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/format";
import { getCurrentDataset } from "@/lib/dataset";
import {
  useConnections,
  useConnectionTest,
  useImportJob,
} from "../hooks/use-connections";
import type { Connection } from "../schemas/ingestion";
import {
  canImport,
  modeLabel,
  statusLabels,
  statusTone,
} from "../services/connection-model";
import { CompatibilityReport } from "./compatibility-report";
import { ConnectionForm } from "./connection-form";
import { ImportQuestions } from "./import-questions";
import { JobProgress } from "./job-progress";

const dotClass = {
  ok: "bg-primary",
  fail: "bg-signal",
  info: "bg-muted-foreground",
} as const;

// Uma conexão que já trouxe dados para um conjunto não pergunta de novo.
function alreadyLinked(connection: Connection) {
  return connection.dataset !== null && connection.last_synced_at !== null;
}

export function ConnectionsCard() {
  const connections = useConnections();
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const test = useConnectionTest(connections.reload);
  const importJob = useImportJob(connections.reload);

  const items = connections.data?.items ?? [];
  const active = items.find((item) => item.id === activeId) ?? null;
  const report = test.report;

  function openTest(connection: Connection) {
    setActiveId(connection.id);
    importJob.reset();
    void test.run(connection.id);
  }

  async function saveConnection(
    form: Parameters<typeof connections.create>[0],
  ) {
    const created = await connections.create(form);
    if (!created) return false;
    setShowForm(false);
    return true;
  }

  return (
    <article className="bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="m-0 text-sm font-semibold text-foreground">
          Conexões com bancos externos
        </h2>
      </div>
      <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
        Lê transações de uma tabela Postgres no formato do SAML-D, sempre em
        modo somente leitura. Teste antes: o relatório mostra o que bate com o
        formato e se os dados continuam o conjunto atual.
      </p>

      {connections.error && (
        <p role="alert" className="m-0 text-xs text-signal">
          {connections.error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="m-0 p-0 list-none divide-y divide-soft border border-border rounded-lg overflow-hidden">
          {items.map((connection) => {
            const tone = statusTone(connection.status);
            return (
              <li
                key={connection.id}
                className="p-3 flex items-center justify-between gap-3 text-xs"
                data-active={connection.id === activeId}
              >
                <div className="min-w-0">
                  <p className="m-0 font-medium text-foreground truncate">
                    {connection.name}
                  </p>
                  <p className="m-0 font-mono text-muted-foreground truncate">
                    {connection.masked_host} / {connection.masked_database} /{" "}
                    {connection.table}
                  </p>
                  {connection.dataset && (
                    <p className="m-0 text-[11px] text-muted-foreground">
                      Conjunto{" "}
                      <span className="font-mono">{connection.dataset}</span>
                      {connection.mode && ` · ${modeLabel(connection.mode)}`}
                    </p>
                  )}
                  {connection.last_synced_at && (
                    <p className="m-0 text-[11px] text-muted-foreground">
                      Última leitura:{" "}
                      {formatShortDate(connection.last_synced_at)}
                    </p>
                  )}
                  {connection.last_error && (
                    <p className="m-0 text-[11px] text-signal">
                      {connection.last_error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${dotClass[tone]}`}
                    />
                    {statusLabels[connection.status]}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={test.testing || connection.status === "syncing"}
                    onClick={() => openTest(connection)}
                  >
                    <FlaskConical className="size-3" strokeWidth={1.5} />
                    Testar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {active && test.testing && (
        <p className="m-0 text-xs text-muted-foreground" role="status">
          Testando “{active.name}”…
        </p>
      )}
      {active && test.error && (
        <p role="alert" className="m-0 text-xs text-signal">
          {test.error}
        </p>
      )}
      {active && report && !importJob.job && (
        <>
          <CompatibilityReport report={report} />
          {canImport(report) && !alreadyLinked(active) ? (
            <ImportQuestions
              key={active.id}
              report={report}
              controlColumn={active.control_column}
              currentDataset={getCurrentDataset()}
              busy={importJob.starting}
              serverError={importJob.error}
              onConfirm={(request) => void importJob.start(active.id, request)}
            />
          ) : (
            alreadyLinked(active) && (
              <p className="m-0 text-xs text-muted-foreground">
                Esta conexão já está ligada ao conjunto {active.dataset}.
              </p>
            )
          )}
        </>
      )}
      {importJob.job && (
        <JobProgress job={importJob.job} error={importJob.error} />
      )}

      {showForm ? (
        <ConnectionForm
          busy={connections.busy}
          serverError={connections.createError}
          onSubmit={saveConnection}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setShowForm(true)}
        >
          <Plus className="size-4" strokeWidth={1.5} />
          Nova conexão
        </Button>
      )}
    </article>
  );
}
