"use client";

import { useState } from "react";
import { Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useProcessing } from "../hooks/use-processing";

function formatRun(value: string | null | undefined) {
  if (!value) return "ainda não executado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProcessingControls({ allowSimulation = true }: { allowSimulation?: boolean }) {
  const processing = useProcessing();
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const settings = processing.data?.settings;
  const job = processing.job;

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="text-right text-xs leading-5 text-muted-foreground">
        <p>Último: {formatRun(settings?.last_run_at)}</p>
        <p>
          Próximo: {settings?.enabled ? formatRun(settings.next_run_at) : "automação desativada"}
        </p>
        {job && (job.status === "queued" || job.status === "running") && (
          <p role="status" className="text-foreground">
            {job.message ?? "Processando…"} {job.progress}%
          </p>
        )}
      </div>
      {allowSimulation && settings?.demo_mode && (
        <Button variant="outline" onClick={() => setSimulatorOpen(true)} disabled={processing.busy}>
          <Play className="size-4" strokeWidth={1.5} />
          Simular transações
        </Button>
      )}
      <Button onClick={() => void processing.processNow()} disabled={processing.busy}>
        <RefreshCw className={processing.busy ? "size-4 animate-spin" : "size-4"} />
        {processing.busy ? "Processando…" : "Processar agora"}
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
            <h2 id="simulator-title" className="text-sm font-semibold">Simular novas transações</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              As datas começam após o último dia do conjunto.
            </p>
          </div>
          <button type="button" aria-label="Fechar simulador" onClick={onClose} className="grid size-11 place-items-center rounded-lg hover:bg-soft">
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
          <Field label="Quantidade de transações">
            <Input type="number" min={50} max={5000} value={transactions} onChange={(event) => setTransactions(Number(event.target.value))} />
          </Field>
          <Field label="Dias simulados">
            <Input type="number" min={1} max={7} value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={injectPattern} onChange={(event) => setInjectPattern(event.target.checked)} />
            Injetar padrão fan-out para demonstração
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={busy || transactions < 50 || transactions > 5000 || days < 1 || days > 7}>Simular e processar</Button>
          </div>
        </form>
      </section>
    </div>
  );
}
