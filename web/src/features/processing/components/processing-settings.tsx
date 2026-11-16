"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { useProcessing } from "../hooks/use-processing";
import type {
  ProcessingSettings,
  ProcessingSettingsUpdate,
} from "../schemas/processing";

export function ProcessingSettingsCard() {
  const t = useTranslations("processing.settings");
  const processing = useProcessing();
  const settings = processing.data?.settings;

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-[22px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <span className="text-xs text-muted-foreground">
          {t("currentDataset")}
        </span>
      </div>
      {processing.loading ? (
        <LoadingState />
      ) : processing.error || !settings ? (
        <ResourceError message={processing.error ?? t("unavailable")} onRetry={processing.reload} />
      ) : (
        <ProcessingSettingsForm
          key={`${settings.dataset}-${settings.interval_minutes}-${settings.enabled}-${settings.demo_mode}-${settings.exploration_per_week}`}
          settings={settings}
          onSave={processing.saveSettings}
        />
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
  const [interval, setInterval] = useState(settings.interval_minutes);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [demoMode, setDemoMode] = useState(settings.demo_mode);
  const [sample, setSample] = useState(settings.exploration_per_week);
  const sampleValid = Number.isInteger(sample) && sample >= 0 && sample <= 50;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          interval_minutes: interval,
          enabled,
          demo_mode: demoMode,
          exploration_per_week: sample,
        });
      }}
    >
      <Field label={t("interval")}>
        <Input type="number" min={5} max={1440} value={interval} onChange={(event) => setInterval(Number(event.target.value))} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        {t("auto")}
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} />
        {t("demo")}
      </label>
      <div className="grid gap-1.5">
        <Field label={t("sample")}>
          <Input
            type="number"
            min={0}
            max={50}
            value={sample}
            onChange={(event) => setSample(Number(event.target.value))}
          />
        </Field>
        <span className="text-xs text-muted-foreground">
          {t("sampleHint")}
        </span>
      </div>
      <div>
        <Button type="submit" disabled={interval < 5 || interval > 1440 || !sampleValid}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
