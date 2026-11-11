"use client";

import { Radar, TriangleAlert } from "lucide-react";
import { Button } from "./button";

export function LoadingState() {
  return (
    <div role="status" aria-label="Carregando dados" className="grid gap-4">
      <span className="sr-only">Carregando…</span>
      <div className="h-9 w-48 animate-pulse rounded-lg bg-track" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-[14px] bg-track" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[14px] bg-track" />
    </div>
  );
}

export function ResourceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="panel grid justify-items-start gap-3 p-6">
      <TriangleAlert className="size-5 text-signal" strokeWidth={1.5} />
      <h2 className="text-base font-semibold text-foreground">
        Não foi possível carregar os dados
      </h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

export function EmptyState({
  title = "Nenhum resultado",
  description = "Ajuste os filtros para ampliar sua busca.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="grid justify-items-center gap-2.5 px-6 py-14 text-center">
      <Radar className="size-7 text-muted-foreground" strokeWidth={1.5} />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
