"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { useHealth } from "../hooks/use-health";

interface HealthMetric {
  label: string;
  value: string;
  ok: boolean;
}

export function HealthPanel() {
  const { state, reload } = useHealth();

  const metrics: HealthMetric[] =
    state.status === "ok"
      ? [
          {
            label: "Banco",
            value: state.health.database.ok ? "Conectado" : "Fora",
            ok: state.health.database.ok,
          },
          {
            label: "Modelo",
            value: state.health.model.ok
              ? state.health.model.file || "lightgbm_v1"
              : "Indisponível",
            ok: state.health.model.ok,
          },
          {
            label: "Chave do LLM",
            value: state.health.llm.ok
              ? state.health.llm.provider || "Configurada"
              : "Não configurada",
            ok: state.health.llm.ok,
          },
          {
            label: "API",
            value:
              API_URL.replace(/^https?:\/\//, "") || "localhost:8000",
            ok: true,
          },
        ]
      : state.status === "error"
      ? [
          { label: "Banco", value: "Desconhecido", ok: false },
          { label: "Modelo", value: "Desconhecido", ok: false },
          { label: "Chave do LLM", value: "Desconhecido", ok: false },
          { label: "API", value: "Inacessível", ok: false },
        ]
      : [
          { label: "Banco", value: "Verificando…", ok: true },
          { label: "Modelo", value: "Verificando…", ok: true },
          { label: "Chave do LLM", value: "Verificando…", ok: true },
          { label: "API", value: "Consultando…", ok: true },
        ];

  return (
    <section className="bg-card border border-border rounded-[14px] p-[22px] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="m-0 text-sm font-semibold text-foreground">Sistema</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={reload}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Atualizar status do sistema"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.5} />
          <span className="sr-only">Atualizar</span>
        </Button>
      </div>

      {state.status === "error" && (
        <p className="text-xs text-signal m-0">
          API inacessível: {state.message}
        </p>
      )}

      <dl className="m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((hl) => (
          <div
            key={hl.label}
            className="p-[12px_14px] border border-soft rounded-[10px] flex flex-col gap-1 bg-background/50"
          >
            <dt className="text-xs text-muted-foreground">{hl.label}</dt>
            <dd className="m-0 flex items-center gap-2 font-medium text-sm text-foreground">
              <span
                className={`size-2 shrink-0 rounded-full ${
                  hl.ok ? "bg-primary" : "bg-signal"
                }`}
                aria-hidden="true"
              />
              <span className="truncate">{hl.value}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
