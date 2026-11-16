"use client";

import { useState } from "react";
import { Plus, FlaskConical, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useFormatters } from "@/i18n/use-formatters";
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
  statusLabel,
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
  const t = useTranslations("ingestion.connections");
  const locale = useLocale();
  const format = useFormatters();
  const connections = useConnections();
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Connection | null>(null);
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

  async function confirmRemoval(connection: Connection) {
    setRemoving(null);
    if (await connections.remove(connection) && connection.id === activeId) {
      setActiveId(null);
      test.reset();
      importJob.reset();
    }
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
          {t("title")}
        </h2>
      </div>
      <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
        {t("intro")}
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
                      {t("dataset")}
                      <span className="font-mono">{connection.dataset}</span>
                      {connection.mode &&
                        ` · ${modeLabel(connection.mode, locale)}`}
                    </p>
                  )}
                  {connection.last_synced_at && (
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {t("lastRead", {
                        date: format.shortDate(connection.last_synced_at),
                      })}
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
                    {statusLabel(connection.status, locale)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={test.testing || connection.status === "syncing"}
                    onClick={() => openTest(connection)}
                  >
                    <FlaskConical className="size-3" strokeWidth={1.5} />
                    {t("test")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t("removeAria", { name: connection.name })}
                    disabled={
                      connections.busy || connection.status === "syncing"
                    }
                    onClick={() => setRemoving(connection)}
                  >
                    <Trash2 className="size-3" strokeWidth={1.5} />
                    {t("remove")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {removing && (
        <div
          role="alertdialog"
          aria-label={t("removeAria", { name: removing.name })}
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
        >
          <p className="m-0 text-sm text-foreground">
            {t("removeQuestion", { name: removing.name })}
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {t("removeNote")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={connections.busy}
              onClick={() => void confirmRemoval(removing)}
            >
              {t("confirmRemove")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemoving(null)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {active && test.testing && (
        <p className="m-0 text-xs text-muted-foreground" role="status">
          {t("testing", { name: active.name })}
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
                {t("linked", { dataset: active.dataset ?? "" })}
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
          {t("new")}
        </Button>
      )}
    </article>
  );
}
