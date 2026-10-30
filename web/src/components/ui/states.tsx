"use client";

import { Radar, TriangleAlert } from "lucide-react";
import { Button } from "./button";

export function LoadingState() {
  return (
    <div role="status" aria-label="Carregando dados" className="grid gap-6">
      <span className="sr-only">Carregando…</span>
      <div className="h-10 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-muted" />
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
    <div role="alert" className="panel grid justify-items-start gap-4 p-8">
      <TriangleAlert className="text-destructive" />
      <h2 className="text-lg font-semibold">
        Não foi possível carregar os dados
      </h2>
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={onRetry}>
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
    <div className="grid justify-items-center gap-3 px-6 py-16 text-center">
      <Radar className="size-8 text-muted-foreground" />
      <h3 className="font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
