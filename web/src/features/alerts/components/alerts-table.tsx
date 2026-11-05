import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  RISK_LABELS,
  SCORE_HINT,
  formatQueuePosition,
  formatScore,
  riskLevel,
} from "@/lib/risk";
import { EmptyState } from "@/components/ui/states";
import type { Alert, AlertStatus } from "../schemas/alerts";

export const statusLabels: Record<AlertStatus, string> = {
  pending: "Pendente",
  escalated: "Em investigação",
  archived: "Arquivado",
  reported: "Para comunicação",
};
export function RiskScore({ value }: { value: number }) {
  const level = riskLevel(value);
  const riskLabel = RISK_LABELS[level];
  return (
    <div
      className="flex min-w-32 items-center gap-3"
      style={{ color: `var(--risk-${level})` }}
      title={`Nota ${formatScore(value)} de 100 · ${riskLabel}. ${SCORE_HINT}`}
    >
      <span className="w-10 font-mono text-sm font-semibold">
        {formatScore(value)}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: value + "%" }}
        />
      </div>
      <span className="sr-only">
        de 100, risco {riskLabel.toLowerCase()}
      </span>
    </div>
  );
}
export function AlertsTable({ items }: { items: Alert[] }) {
  if (!items.length) return <EmptyState title="Nenhum alerta nesta seleção" />;
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <caption className="sr-only">
          Alertas ordenados pela posição na fila
        </caption>
        <thead>
          <tr>
            <th>Alerta / conta</th>
            <th title={SCORE_HINT}>Nota de risco</th>
            <th>Tipologia sugerida</th>
            <th>País</th>
            <th>Valor sinalizado</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Ação</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((alert) => (
            <tr key={alert.id}>
              <td>
                <Link
                  href={"/alerts/" + alert.id}
                  className="font-semibold text-primary hover:underline"
                >
                  {alert.id}
                </Link>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {alert.account} · {formatQueuePosition(alert.queue_position)}
                </p>
              </td>
              <td>
                <RiskScore value={alert.score} />
              </td>
              <td>{alert.typology}</td>
              <td>{alert.country}</td>
              <td className="font-medium">{formatCurrency(alert.amount)}</td>
              <td>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${alert.status === "pending" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}
                >
                  {statusLabels[alert.status]}
                </span>
              </td>
              <td>
                <Link
                  href={"/alerts/" + alert.id}
                  aria-label={"Abrir alerta " + alert.id}
                >
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
