"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/api";
import { useHealth } from "../hooks/use-health";

interface HealthMetric {
  label: string;
  value: string;
  ok: boolean;
}

export function HealthPanel() {
  const t = useTranslations("health");
  const { state, reload } = useHealth();

  const metrics: HealthMetric[] =
    state.status === "ok"
      ? [
          {
            label: t("database"),
            value: state.health.database.ok ? t("connected") : t("down"),
            ok: state.health.database.ok,
          },
          {
            label: t("model"),
            value: state.health.model.ok
              ? state.health.model.file || "lightgbm_v1"
              : t("unavailable"),
            ok: state.health.model.ok,
          },
          {
            label: t("llm"),
            value: state.health.llm.ok
              ? state.health.llm.provider || t("configured")
              : t("notConfigured"),
            ok: state.health.llm.ok,
          },
          {
            label: t("api"),
            value:
              API_URL.replace(/^https?:\/\//, "") || "localhost:8000",
            ok: true,
          },
        ]
      : state.status === "error"
      ? [
          { label: t("database"), value: t("unknown"), ok: false },
          { label: t("model"), value: t("unknown"), ok: false },
          { label: t("llm"), value: t("unknown"), ok: false },
          { label: t("api"), value: t("unreachable"), ok: false },
        ]
      : [
          { label: t("database"), value: t("checking"), ok: true },
          { label: t("model"), value: t("checking"), ok: true },
          { label: t("llm"), value: t("checking"), ok: true },
          { label: t("api"), value: t("querying"), ok: true },
        ];

  return (
    <section className="bg-card border border-border rounded-[14px] p-[22px] flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h2 className="m-0 text-sm font-semibold text-foreground">
          {t("title")}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={reload}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          aria-label={t("refresh")}
        >
          <RefreshCw className="size-3.5" strokeWidth={1.5} />
          <span className="sr-only">{t("refreshSr")}</span>
        </Button>
      </div>

      {state.status === "error" && (
        <p className="text-xs text-signal m-0">
          {t("apiUnreachable", { message: state.message })}
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
