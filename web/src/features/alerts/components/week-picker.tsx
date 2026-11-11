"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { formatWeekLabel } from "@/lib/risk";

// Só oferece períodos já processados. Um campo de
// data livre deixava escolher qualquer dia, inclusive fora do SAML-D ou no meio da semana.
export function WeekPicker({ className = "" }: { className?: string }) {
  const { week, setWeek, weeks, weeksLoading } = useAppContext();
  const index = weeks.indexOf(week);
  // `weeks` vem da mais recente para a mais antiga.
  const older = index >= 0 ? weeks[index + 1] : undefined;
  const newer = index > 0 ? weeks[index - 1] : undefined;

  if (weeksLoading) {
    return (
      <span className="text-xs text-muted-foreground">Carregando semanas…</span>
    );
  }

  if (weeks.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Nenhuma semana liberada
      </span>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 p-1 border border-border rounded-[10px] bg-card ${className}`}
    >
      <button
        type="button"
        aria-label="Semana anterior"
        title={older ? "Semana de " + formatWeekLabel(older) : "Primeira semana liberada"}
        disabled={!older}
        onClick={() => older && setWeek(older)}
        className="size-9 grid place-items-center rounded-[7px] border-0 bg-transparent text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:not-disabled:bg-muted/50 transition-colors"
      >
        <ChevronLeft className="size-4 text-current" strokeWidth={1.5} />
      </button>
      <label className="flex flex-col px-2.5 leading-tight">
        <span className="text-[11px] text-muted-foreground">Semana</span>
        <select
          aria-label="Semana de referência"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          className="border-0 bg-transparent p-0 font-medium text-sm text-foreground cursor-pointer focus:outline-none whitespace-nowrap pr-2"
        >
          {weeks.map((w) => (
            <option key={w} value={w} className="bg-card text-foreground">
              {formatWeekLabel(w)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label="Próxima semana"
        title={newer ? "Semana de " + formatWeekLabel(newer) : "Semana mais recente liberada"}
        disabled={!newer}
        onClick={() => newer && setWeek(newer)}
        className="size-9 grid place-items-center rounded-[7px] border-0 bg-transparent text-foreground disabled:text-muted-foreground/40 disabled:cursor-not-allowed hover:not-disabled:bg-muted/50 transition-colors"
      >
        <ChevronRight className="size-4 text-current" strokeWidth={1.5} />
      </button>
    </div>
  );
}
