"use client";

import { useCallback } from "react";
import { useResource } from "@/hooks/use-resource";
import { selectDataset } from "@/lib/dataset";
import * as alertsService from "../services/alerts-service";

// Catálogo de semanas liberadas. Fica fora de use-alerts.ts porque o AppContextProvider o
// usa, e use-alerts.ts importa o contexto (o import seria circular). `revision` recarrega o
// catálogo depois de um replay.
export function useWeekCatalog(revision: number, dataset: string) {
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        selectDataset(dataset);
        return alertsService.fetchWeeks(signal);
      },
      [revision, dataset],
    ),
    { resetKey: dataset },
  );
}
