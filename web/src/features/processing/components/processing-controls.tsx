"use client";

import { useState } from "react";
import { Play, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useFormatters } from "@/i18n/use-formatters";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import { useProcessing } from "../hooks/use-processing";

export function ProcessingControls({ allowSimulation = true }: { allowSimulation?: boolean }) {
  const t = useTranslations("processing");
  const format = useFormatters();
  const jobMessage = useJobMessage();
  const formatRun = (value: string | null | undefined) =>
    value
      ? format.dateTime(value, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: undefined,
        })
      : t("never");
  const processing = useProcessing();
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const settings = processing.data?.settings;
  const job = processing.job;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="text-right text-xs leading-5 text-muted-foreground">
        <p>{t("last", { when: formatRun(settings?.last_run_at) })}</p>
        <p>
          {t("next", {
            when: settings?.enabled
              ? formatRun(settings.next_run_at)
              : t("autoOff"),
          })}
        </p>
        {job && (job.status === "queued" || job.status === "running") && (
          <p role="status" className="text-foreground">
            {jobMessage(job) ?? t("working")} {job.progress}%
          </p>
        )}
      </div>
      {allowSimulation && settings?.demo_mode && (
        <Button variant="outline" onClick={() => setSimulatorOpen(true)} disabled={processing.busy}>
          <Play className="size-4" strokeWidth={1.5} />
          {t("simulate")}
        </Button>
      )}
      <Button onClick={() => void processing.processNow()} disabled={processing.busy}>
        <RefreshCw className={processing.busy ? "size-4 animate-spin" : "size-4"} />
        {processing.busy ? t("working") : t("processNow")}
      </Button>
      {simulatorOpen && (
        <SimulatorDialog
          busy={processing.busy}
          onClose={() => setSimulatorOpen(false)}
          onSubmit={(request) => {
            void processing.simulate(request);
            setSimulatorOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SimulatorDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (request: { transactions: number; days: number; inject_pattern: boolean }) => void;
}) {
  const t = useTranslations("processing.simulator");
  const [transactions, setTransactions] = useState(250);
  const [days, setDays] = useState(3);
  const [injectPattern, setInjectPattern] = useState(true);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulator-title"
        className="w-full max-w-lg rounded-[14px] border border-border bg-card p-[22px]"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="simulator-title" className="text-sm font-semibold">
              {t("title")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("hint")}
            </p>
          </div>
          <button type="button" aria-label={t("close")} onClick={onClose} className="grid size-11 place-items-center rounded-lg hover:bg-soft">
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </header>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ transactions, days, inject_pattern: injectPattern });
          }}
        >
          <Field label={t("count")}>
            <Input type="number" min={50} max={5000} value={transactions} onChange={(event) => setTransactions(Number(event.target.value))} />
          </Field>
          <Field label={t("days")}>
            <Input type="number" min={1} max={7} value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={injectPattern} onChange={(event) => setInjectPattern(event.target.checked)} />
            {t("fanOut")}
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || transactions < 50 || transactions > 5000 || days < 1 || days > 7}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
