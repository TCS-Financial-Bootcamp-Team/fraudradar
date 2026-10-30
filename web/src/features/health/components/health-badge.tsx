"use client";
import { useHealth } from "../hooks/use-health";
export function HealthBadge() {
  const { state, reload } = useHealth();
  const ok = state.status === "ok" && state.health.status === "ok";
  return (
    <button
      title="Atualizar saúde do sistema"
      onClick={reload}
      className="flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-[11px] text-muted-foreground"
    >
      <span
        className={`size-1.5 rounded-full ${ok ? "bg-primary" : "bg-risk-medium"}`}
      />
      {state.status === "loading"
        ? "Verificando sistema…"
        : ok
          ? "Sistema operacional"
          : state.status === "error"
            ? "API indisponível"
            : "Sistema degradado"}
    </button>
  );
}
