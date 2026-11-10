"use client";

import { useHealth } from "../hooks/use-health";

export function HealthBadge() {
  const { state, reload } = useHealth();
  const ok = state.status === "ok" && state.health.status === "ok";
  const isLoading = state.status === "loading";

  return (
    <button
      type="button"
      title="Atualizar saúde do sistema"
      onClick={reload}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${
          isLoading
            ? "bg-muted-foreground animate-pulse"
            : ok
              ? "bg-primary"
              : "bg-signal"
        }`}
      />
      <span className="text-muted-foreground">
        {isLoading
          ? "Verificando sistema…"
          : ok
            ? "Sistema operacional"
            : state.status === "error"
              ? "API indisponível"
              : "Sistema degradado"}
      </span>
    </button>
  );
}
