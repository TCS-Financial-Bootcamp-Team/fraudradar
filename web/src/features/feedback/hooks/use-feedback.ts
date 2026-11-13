"use client";

import { useCallback } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import * as feedbackService from "../services/feedback-service";

/** O retorno dos analistas até a semana em exibição (todos os períodos anteriores entram). */
export function useFeedbackSummary() {
  const { week, dataset, revision } = useAppContext();
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        void dataset;
        return feedbackService.fetchFeedbackSummary(
          { to: week || undefined },
          signal,
        );
      },
      [week, dataset, revision],
    ),
  );
}
