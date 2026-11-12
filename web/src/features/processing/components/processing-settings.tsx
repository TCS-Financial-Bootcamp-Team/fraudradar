"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { useProcessing } from "../hooks/use-processing";
import type {
  ProcessingSettings,
  ProcessingSettingsUpdate,
} from "../schemas/processing";

export function ProcessingSettingsCard() {
  const processing = useProcessing();
  const settings = processing.data?.settings;

  return (
    <section className="flex flex-col gap-4 rounded-[14px] border border-border bg-card p-[22px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Processamento</h2>
        <span className="text-xs text-muted-foreground">conjunto atual</span>
      </div>
      {processing.loading ? (
        <LoadingState />
      ) : processing.error || !settings ? (
        <ResourceError message={processing.error ?? "Configuração indisponível."} onRetry={processing.reload} />
      ) : (
        <ProcessingSettingsForm
          key={`${settings.dataset}-${settings.interval_minutes}-${settings.enabled}-${settings.demo_mode}`}
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
  const [interval, setInterval] = useState(settings.interval_minutes);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [demoMode, setDemoMode] = useState(settings.demo_mode);
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ interval_minutes: interval, enabled, demo_mode: demoMode });
      }}
    >
      <Field label="Intervalo automático (minutos)">
        <Input type="number" min={5} max={1440} value={interval} onChange={(event) => setInterval(Number(event.target.value))} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Processamento automático ativo
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} />
        Modo demonstração
      </label>
      <div><Button type="submit" disabled={interval < 5 || interval > 1440}>Salvar processamento</Button></div>
    </form>
  );
}
