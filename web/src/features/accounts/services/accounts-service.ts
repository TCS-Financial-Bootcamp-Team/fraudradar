import { apiGet, USE_MOCKS } from "@/lib/api";
import {
  accountAlertsSchema,
  suspiciousAccountsSchema,
  type AccountFilters,
} from "../schemas/accounts";

export async function fetchSuspiciousAccounts(
  filters: AccountFilters,
  signal?: AbortSignal,
) {
  if (USE_MOCKS)
    return suspiciousAccountsSchema.parse(
      (await import("./mocks")).suspiciousAccountsMock(filters),
    );
  const query = new URLSearchParams({
    page: String(filters.page ?? 1),
    size: "20",
    sort: filters.sort ?? "max_score_desc",
  });
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.status) query.set("status", filters.status);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  return suspiciousAccountsSchema.parse(
    await apiGet("/accounts/suspicious?" + query, { signal }),
  );
}

export async function fetchAccountAlerts(account: string, signal?: AbortSignal) {
  return accountAlertsSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).accountAlertsMock(account)
      : await apiGet("/accounts/" + encodeURIComponent(account) + "/alerts", {
          signal,
        }),
  );
}
