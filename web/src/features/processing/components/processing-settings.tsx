"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LoadingState, RefreshBar, ResourceError } from "@/components/ui/states";
import { useFormatters } from "@/i18n/use-formatters";
import { useProcessing } from "../hooks/use-processing";
import type {
  ProcessingSettings,
  ProcessingSettingsUpdate,
} from "../schemas/processing";

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function ProcessingSettingsCard() {
  const t = useTranslations("processing.settings");
  const format = useFormatters();
  const processing = useProcessing();
  const settings = processing.data?.settings;

  const formatRun = (value: string | null) =>
    value
      ? format.dateTime(value, {
          dateStyle: "short",
          timeStyle: "short",
          timeZone: undefined,
        })
      : t("neverRun");

  return (
    <section
      aria-busy={processing.refreshing || undefined}
      className="relative overflow-hidden flex flex-col gap-4 rounded-[14px] border border-border bg-card p-4 sm:p-[22px]"
    >
      <RefreshBar active={processing.refreshing} />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <span
            className={
              settings
                ? "font-mono text-xs text-muted-foreground"
                : "text-xs text-muted-foreground"
            }
          >
            {settings
              ? t("currentDatasetNamed", { dataset: settings.dataset })
              : t("currentDataset")}
          </span>
        </div>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {processing.loading ? (
        <LoadingState />
      ) : processing.error || !settings ? (
        <ResourceError
          message={processing.error ?? t("unavailable")}
          onRetry={processing.reload}
        />
      ) : (
        <>
          <dl className="m-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-[10px] border border-soft bg-background/50 px-3.5 py-3">
              <dt className="text-xs text-muted-foreground">
                {t("lastRunLabel")}
              </dt>
              <dd className="m-0 text-sm font-medium tabular-nums text-foreground">
                {formatRun(settings.last_run_at)}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-[10px] border border-soft bg-background/50 px-3.5 py-3">
              <dt className="text-xs text-muted-foreground">
                {t("nextRunLabel")}
              </dt>
              <dd className="m-0 flex items-center gap-2 text-sm font-medium tabular-nums text-foreground">
                <span
                  aria-hidden="true"
                  className={
                    settings.enabled
                      ? "size-2 shrink-0 rounded-full bg-primary"
                      : "size-2 shrink-0 rounded-full bg-muted-foreground/40"
                  }
                />
                <span>
                  {settings.enabled
                    ? formatRun(settings.next_run_at)
                    : t("autoOffLabel")}
                </span>
              </dd>
            </div>
          </dl>

          <ProcessingSettingsForm
            key={`${settings.dataset}-${settings.interval_minutes}-${settings.enabled}-${settings.demo_mode}-${settings.exploration_per_week}`}
            settings={settings}
            onSave={processing.saveSettings}
          />
        </>
      )}
    </section>
  );
}

function ProcessingSettingsForm({
  settings,
  onSave,
}: {
  settings: ProcessingSettings;
  onSave: (update: ProcessingSettingsUpdate) => Promise<void>;
}) {
  const t = useTranslations("processing.settings");
  const baseId = useId();
  const autoId = `${baseId}-auto`;
  const autoHintId = `${baseId}-auto-hint`;
  const intervalId = `${baseId}-interval`;
  const intervalHintId = `${baseId}-interval-hint`;
  const intervalErrorId = `${baseId}-interval-error`;
  const sampleId = `${baseId}-sample`;
  const sampleHintId = `${baseId}-sample-hint`;
  const sampleScopeId = `${baseId}-sample-scope`;
  const sampleErrorId = `${baseId}-sample-error`;
  const simulatorId = `${baseId}-simulator`;
  const simulatorHintId = `${baseId}-simulator-hint`;

  const [intervalInput, setIntervalInput] = useState(
    String(settings.interval_minutes),
  );
  const [enabled, setEnabled] = useState(settings.enabled);
  const [demoMode, setDemoMode] = useState(settings.demo_mode);
  const [sampleInput, setSampleInput] = useState(
    String(settings.exploration_per_week),
  );
  const [saving, setSaving] = useState(false);

  const interval = parseWholeNumber(intervalInput);
  const sample = parseWholeNumber(sampleInput);
  const intervalValid = interval !== null && interval >= 5 && interval <= 1440;
  const sampleValid = sample !== null && sample >= 0 && sample <= 50;
  const formValid = intervalValid && sampleValid;

  const intervalDescribedBy = intervalValid
    ? intervalHintId
    : `${intervalErrorId} ${intervalHintId}`;
  const sampleDescribedBy = sampleValid
    ? `${sampleHintId} ${sampleScopeId}`
    : `${sampleErrorId} ${sampleHintId} ${sampleScopeId}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formValid || saving || interval === null || sample === null) return;
    setSaving(true);
    try {
      await onSave({
        interval_minutes: interval,
        enabled,
        demo_mode: demoMode,
        exploration_per_week: sample,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      <fieldset className="m-0 grid gap-4 border-0 p-0">
        <legend className="mb-2.5 p-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {t("automationSection")}
        </legend>

        <div className="flex items-start gap-3 rounded-[10px] border border-soft bg-background/40 p-3.5">
          <span className="grid size-6 shrink-0 place-items-center">
            <input
              id={autoId}
              type="checkbox"
              checked={enabled}
              aria-describedby={autoHintId}
              onChange={(event) => setEnabled(event.target.checked)}
              className="size-4 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            />
          </span>
          <div className="min-w-0 flex-1 grid gap-1">
            <label
              htmlFor={autoId}
              className="block cursor-pointer text-[13px] font-medium leading-6 text-foreground"
            >
              {t("auto")}
            </label>
            <p
              id={autoHintId}
              className="m-0 text-xs leading-relaxed text-muted-foreground"
            >
              {t("autoHint")}
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Field label={t("interval")}>
            <Input
              id={intervalId}
              type="number"
              inputMode="numeric"
              min={5}
              max={1440}
              step={1}
              value={intervalInput}
              aria-describedby={intervalDescribedBy}
              aria-invalid={!intervalValid || undefined}
              onChange={(event) => setIntervalInput(event.target.value)}
              className="tabular-nums"
            />
          </Field>
          {!intervalValid && (
            <p
              id={intervalErrorId}
              role="alert"
              className="m-0 text-xs text-signal"
            >
              {t("intervalError")}
            </p>
          )}
          <p
            id={intervalHintId}
            className="m-0 text-xs leading-relaxed text-muted-foreground"
          >
            {t("intervalHint")}
          </p>
        </div>
      </fieldset>

      <fieldset className="m-0 grid gap-1.5 border-0 border-t border-border p-0 pt-5">
        <legend className="mb-2.5 p-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {t("sampleSection")}
        </legend>

        <Field label={t("sample")}>
          <Input
            id={sampleId}
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            step={1}
            value={sampleInput}
            aria-describedby={sampleDescribedBy}
            aria-invalid={!sampleValid || undefined}
            onChange={(event) => setSampleInput(event.target.value)}
            className="tabular-nums"
          />
        </Field>
        {!sampleValid && (
          <p
            id={sampleErrorId}
            role="alert"
            className="m-0 text-xs text-signal"
          >
            {t("sampleError")}
          </p>
        )}
        <p
          id={sampleHintId}
          className="m-0 text-xs leading-relaxed text-muted-foreground"
        >
          {t("sampleHint")}
        </p>
        <p
          id={sampleScopeId}
          className="m-0 text-xs leading-relaxed text-muted-foreground"
        >
          {t("sampleScope")}
        </p>
      </fieldset>

      <fieldset className="m-0 grid gap-2 border-0 border-t border-border p-0 pt-5">
        <legend className="mb-2.5 p-0 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {t("simulatorSection")}
        </legend>

        <div className="flex items-start gap-3 rounded-[10px] border border-soft bg-background/40 p-3.5">
          <span className="grid size-6 shrink-0 place-items-center">
            <input
              id={simulatorId}
              type="checkbox"
              checked={demoMode}
              aria-describedby={simulatorHintId}
              onChange={(event) => setDemoMode(event.target.checked)}
              className="size-4 cursor-pointer rounded border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            />
          </span>
          <div className="min-w-0 flex-1 grid gap-1">
            <label
              htmlFor={simulatorId}
              className="block cursor-pointer text-[13px] font-medium leading-6 text-foreground"
            >
              {t("simulatorToggle")}
            </label>
            <p
              id={simulatorHintId}
              className="m-0 text-xs leading-relaxed text-muted-foreground"
            >
              {t("simulatorHint")}
            </p>
          </div>
        </div>
      </fieldset>

      <div className="pt-1">
        <Button type="submit" disabled={!formValid || saving}>
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
