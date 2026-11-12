"use client";

import { useCallback } from "react";
import { useAppContext } from "@/components/app-context";
import { useResource } from "@/hooks/use-resource";
import type { AccountFilters } from "../schemas/accounts";
import * as service from "../services/accounts-service";

export function useSuspiciousAccounts(filters: AccountFilters) {
  const { revision } = useAppContext();
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        return service.fetchSuspiciousAccounts(filters, signal);
      },
      [filters, revision],
    ),
  );
}

export function useAccountAlerts(account: string) {
  const { revision } = useAppContext();
  return useResource(
    useCallback(
      (signal: AbortSignal) => {
        void revision;
        return service.fetchAccountAlerts(account, signal);
      },
      [account, revision],
    ),
  );
}
