"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppContext } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { formatShortDate } from "@/lib/format";

// Só oferece semanas liberadas pelo replay (as que têm transações processadas). Um campo de
// data livre deixava escolher qualquer dia, inclusive fora do SAML-D ou no meio da semana.
export function WeekPicker({ className = "" }: { className?: string }) {
  const { week, setWeek, weeks, weeksLoading } = useAppContext();
  const index = weeks.indexOf(week);
  // `weeks` vem da mais recente para a mais antiga.
  const older = index >= 0 ? weeks[index + 1] : undefined;
  const newer = index > 0 ? weeks[index - 1] : undefined;

  if (weeksLoading)
    return (
      <span className="text-xs text-muted-foreground">Carregando semanas…</span>
    );
  if (weeks.length === 0)
    return (
      <span className="text-xs text-muted-foreground">
        Nenhuma semana liberada
      </span>
    );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Semana anterior"
        title={older ? "Semana de " + formatShortDate(older) : "Primeira semana liberada"}
        disabled={!older}
        onClick={() => older && setWeek(older)}
      >
        <ChevronLeft />
      </Button>
      <Select
        className="h-8 w-auto min-w-0 max-w-full border-0 bg-muted py-0 pl-2.5 pr-7 text-xs"
        aria-label="Semana de referência"
        value={week}
        onChange={(e) => setWeek(e.target.value)}
      >
        {weeks.map((w) => (
          <option key={w} value={w}>
            Semana de {formatShortDate(w)}
          </option>
        ))}
      </Select>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Próxima semana"
        title={newer ? "Semana de " + formatShortDate(newer) : "Semana mais recente liberada"}
        disabled={!newer}
        onClick={() => newer && setWeek(newer)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
