"use client";

import { useCallback } from "react";
import { useResource } from "@/hooks/use-resource";
import * as datasetsService from "../services/datasets-service";

export function useDatasets() {
  return useResource(
    useCallback(
      (signal: AbortSignal) => datasetsService.fetchDatasets(signal),
      [],
    ),
  );
}
