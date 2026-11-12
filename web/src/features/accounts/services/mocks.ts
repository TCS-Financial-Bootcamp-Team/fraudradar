import { currentAlertsMock } from "@/features/alerts/services/mocks";
import type { AccountFilters, SuspiciousAccount } from "../schemas/accounts";

export function suspiciousAccountsMock(filters: AccountFilters) {
  const grouped = new Map<string, ReturnType<typeof currentAlertsMock>>();
  for (const alert of currentAlertsMock()) {
    if (filters.from && alert.week < filters.from) continue;
    if (filters.to && alert.week > filters.to) continue;
    if (filters.status && alert.status !== filters.status) continue;
    if (filters.search && !alert.account.toLowerCase().includes(filters.search.toLowerCase())) continue;
    grouped.set(alert.account, [...(grouped.get(alert.account) ?? []), alert]);
  }
  const items: SuspiciousAccount[] = [...grouped.entries()].map(([account, alerts]) => {
    const ordered = [...alerts].sort((a, b) => b.week.localeCompare(a.week));
    const latest = ordered[0];
    return {
      account,
      max_score: Math.max(...alerts.map((alert) => alert.score)),
      latest_score: latest.score,
      alert_weeks: new Set(alerts.map((alert) => alert.week)).size,
      first_week: ordered.at(-1)?.week ?? latest.week,
      last_week: latest.week,
      total_flagged_amount: alerts.reduce((total, alert) => total + alert.amount, 0),
      country: [...alerts].sort((a, b) => b.amount - a.amount)[0].country,
      status: latest.status,
      latest_alert_id: latest.id,
    };
  });
  const sort = filters.sort ?? "max_score_desc";
  items.sort((a, b) => {
    if (sort === "latest_score_desc") return b.latest_score - a.latest_score;
    if (sort === "last_week_desc") return b.last_week.localeCompare(a.last_week) || b.max_score - a.max_score;
    return b.max_score - a.max_score || b.latest_score - a.latest_score;
  });
  const page = filters.page ?? 1;
  return { items: items.slice((page - 1) * 20, page * 20), total: items.length };
}

export function accountAlertsMock(account: string) {
  return {
    items: currentAlertsMock()
      .filter((alert) => alert.account === account)
      .sort((a, b) => b.week.localeCompare(a.week)),
  };
}
