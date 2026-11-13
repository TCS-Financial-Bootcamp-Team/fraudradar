"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAppContext } from "@/components/app-context";
import { formatWeekLabel } from "@/lib/risk";

// Só oferece períodos já processados. Um campo de
// data livre deixava escolher qualquer dia, inclusive fora do SAML-D ou no meio da semana.
export function WeekPicker({ className = "" }: { className?: string }) {
  const t = useTranslations("alerts.weekPicker");
  const locale = useLocale();
  const { week, setWeek, weeks, weeksLoading } = useAppContext();
  const index = weeks.indexOf(week);
  // `weeks` vem da mais recente para a mais antiga.
  const older = index >= 0 ? weeks[index + 1] : undefined;
  const newer = index > 0 ? weeks[index - 1] : undefined;

  if (weeksLoading) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("loading")}
      </span>
    );
  }

  if (weeks.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("none")}
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 border border-border rounded-[10px] bg-card ${className}`}
    >
      <button
        type="button"
        aria-label={t("previous")}
        title={
          older
            ? t("weekOf", { week: formatWeekLabel(older, locale) })
            : t("firstReleased")
        }
        disabled={!older}
        onClick={() => older && setWeek(older)}
        className="size-9 grid place-items-center rounded-[7px] border-0 bg-transparent text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:not-disabled:bg-muted/50 transition-colors"
      >
        <ChevronLeft className="size-4 text-current" strokeWidth={1.5} />
      </button>
      <label className="flex flex-col px-2.5 leading-tight">
        <span className="text-[11px] text-muted-foreground">{t("label")}</span>
        <select
          aria-label={t("select")}
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          className="border-0 bg-transparent p-0 font-medium text-sm text-foreground cursor-pointer focus:outline-none whitespace-nowrap pr-2"
        >
          {weeks.map((w) => (
            <option key={w} value={w} className="bg-card text-foreground">
              {formatWeekLabel(w, locale)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label={t("next")}
        title={
          newer
            ? t("weekOf", { week: formatWeekLabel(newer, locale) })
            : t("latestReleased")
        }
        disabled={!newer}
        onClick={() => newer && setWeek(newer)}
        className="size-9 grid place-items-center rounded-[7px] border-0 bg-transparent text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:not-disabled:bg-muted/50 transition-colors"
      >
        <ChevronRight className="size-4 text-current" strokeWidth={1.5} />
      </button>
    </div>
  );
}
