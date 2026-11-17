"use client";

import { Radar, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";

export function RefreshBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-track"
    >
      <div className="refresh-bar-indicator h-full w-1/3 bg-primary" />
    </div>
  );
}

export function LoadingState() {
  const t = useTranslations("shell.states");
  return (
    <div role="status" aria-label={t("loadingLabel")} className="grid gap-4">
      <span className="sr-only">{t("loading")}</span>
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
  const t = useTranslations("shell.states");
  return (
    <div role="alert" className="panel grid justify-items-start gap-3 p-6">
      <TriangleAlert className="size-5 text-signal" strokeWidth={1.5} />
      <h2 className="text-base font-semibold text-foreground">
        {t("loadFailedTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t("retry")}
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  const t = useTranslations("shell.states");
  return (
    <div className="grid justify-items-center gap-2.5 px-6 py-14 text-center">
      <Radar className="size-7 text-muted-foreground" strokeWidth={1.5} />
      <h3 className="text-sm font-semibold text-foreground">{title ?? t("emptyTitle")}</h3>
      <p className="max-w-sm text-xs text-muted-foreground">{description ?? t("emptyDescription")}</p>
    </div>
  );
}
