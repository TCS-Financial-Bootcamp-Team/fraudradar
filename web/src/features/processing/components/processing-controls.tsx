"use client";

import { useId, useState, type FormEvent } from "react";
import { Play, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useFormatters } from "@/i18n/use-formatters";
import { useJobMessage } from "@/features/jobs/hooks/use-job-message";
import { useProcessing } from "../hooks/use-processing";

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function ProcessingControls({
  allowSimulation = true,
}: {
  allowSimulation?: boolean;
}) {
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
    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-3">
      <div className="text-left sm:text-right text-xs leading-5 text-muted-foreground tabular-nums">
        <p className="m-0">{t("last", { when: formatRun(settings?.last_run_at) })}</p>
        <p className="m-0">
          {t("next", {
            when: settings?.enabled
              ? formatRun(settings.next_run_at)
              : t("autoOff"),
          })}
        </p>
        {job && (job.status === "queued" || job.status === "running") && (
          <p role="status" className="m-0 text-foreground">
            {jobMessage(job) ?? t("working")} {job.progress}%
          </p>
        )}
      </div>
      {allowSimulation && settings?.demo_mode && (
        <Button
          variant="outline"
          onClick={() => setSimulatorOpen(true)}
          disabled={processing.busy}
        >
          <Play className="size-4" strokeWidth={1.5} aria-hidden="true" />
          {t("simulate")}
        </Button>
      )}
      <Button
        onClick={() => void processing.processNow()}
        disabled={processing.busy}
      >
        <RefreshCw
          className={processing.busy ? "size-4 animate-spin" : "size-4"}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {processing.busy ? t("working") : t("processNow")}
      </Button>
      <SimulatorDialog
        open={simulatorOpen}
        busy={processing.busy}
        onOpenChange={setSimulatorOpen}
        onSubmit={(request) => {
          void processing.simulate(request);
          setSimulatorOpen(false);
        }}
      />
    </div>
  );
}

function SimulatorDialog({
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: {
    transactions: number;
    days: number;
    inject_pattern: boolean;
  }) => void;
}) {
  const t = useTranslations("processing.simulator");
  const baseId = useId();
  const countId = `${baseId}-count`;
  const countHintId = `${baseId}-count-hint`;
  const countErrorId = `${baseId}-count-error`;
  const daysId = `${baseId}-days`;
  const daysHintId = `${baseId}-days-hint`;
  const daysErrorId = `${baseId}-days-error`;
  const fanOutId = `${baseId}-fan-out`;
  const fanOutHintId = `${baseId}-fan-out-hint`;

  const [transactionsInput, setTransactionsInput] = useState("250");
  const [daysInput, setDaysInput] = useState("3");
  const [injectPattern, setInjectPattern] = useState(true);

  const transactions = parseWholeNumber(transactionsInput);
  const days = parseWholeNumber(daysInput);
  const transactionsValid =
    transactions !== null && transactions >= 50 && transactions <= 5000;
  const daysValid = days !== null && days >= 1 && days <= 7;
  const formValid = transactionsValid && daysValid;

  const countDescribedBy = transactionsValid
    ? countHintId
    : `${countErrorId} ${countHintId}`;
  const daysDescribedBy = daysValid
    ? daysHintId
    : `${daysErrorId} ${daysHintId}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValid || busy || transactions === null || days === null) return;
    onSubmit({ transactions, days, inject_pattern: injectPattern });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-y-auto p-5 sm:p-[22px]">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="m-0 text-sm font-semibold text-foreground">
              {t("title")}
            </DialogTitle>
            <DialogDescription className="mt-1 mb-0 text-xs leading-relaxed text-muted-foreground">
              {t("hint")}
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("close")}
                className="min-h-11 min-w-11 shrink-0 -mr-2 -mt-2"
              >
                <X className="size-4" strokeWidth={1.5} aria-hidden="true" />
              </Button>
            }
          />
        </header>
        <form className="grid gap-4" noValidate onSubmit={handleSubmit}>
          <div className="grid gap-1.5">
            <Field label={t("count")}>
              <Input
                id={countId}
                type="number"
                inputMode="numeric"
                min={50}
                max={5000}
                step={1}
                value={transactionsInput}
                aria-describedby={countDescribedBy}
                aria-invalid={!transactionsValid || undefined}
                onChange={(event) => setTransactionsInput(event.target.value)}
                className="tabular-nums"
              />
            </Field>
            {!transactionsValid && (
              <p
                id={countErrorId}
                role="alert"
                className="m-0 text-xs text-signal"
              >
                {t("countError")}
              </p>
            )}
            <p
              id={countHintId}
              className="m-0 text-xs leading-relaxed text-muted-foreground"
            >
              {t("countHint")}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Field label={t("days")}>
              <Input
                id={daysId}
                type="number"
                inputMode="numeric"
                min={1}
                max={7}
                step={1}
                value={daysInput}
                aria-describedby={daysDescribedBy}
                aria-invalid={!daysValid || undefined}
                onChange={(event) => setDaysInput(event.target.value)}
                className="tabular-nums"
              />
            </Field>
            {!daysValid && (
              <p
                id={daysErrorId}
                role="alert"
                className="m-0 text-xs text-signal"
              >
                {t("daysError")}
              </p>
            )}
            <p
              id={daysHintId}
              className="m-0 text-xs leading-relaxed text-muted-foreground"
            >
              {t("daysHint")}
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-[10px] border border-soft bg-background/40 p-3.5">
            <span className="grid size-6 shrink-0 place-items-center">
              <input
                id={fanOutId}
                type="checkbox"
                checked={injectPattern}
                aria-describedby={fanOutHintId}
                onChange={(event) => setInjectPattern(event.target.checked)}
                className="size-4 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              />
            </span>
            <div className="min-w-0 flex-1 grid gap-1">
              <label
                htmlFor={fanOutId}
                className="block cursor-pointer text-[13px] font-medium leading-6 text-foreground"
              >
                {t("fanOut")}
              </label>
              <p
                id={fanOutHintId}
                className="m-0 text-xs leading-relaxed text-muted-foreground"
              >
                {t("fanOutHint")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap-reverse justify-end gap-3 pt-2 sm:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !formValid}>
              {t("submit")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
