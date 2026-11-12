import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import {
  RISK_LABELS,
  SCORE_HINT,
  formatScore,
  isHighRisk,
  riskLevel,
} from "@/lib/risk";
import type { Alert, AlertStatus } from "../schemas/alerts";

export const statusLabels: Record<AlertStatus, string> = {
  pending: "Pendente",
  escalated: "Em investigação",
  archived: "Arquivado",
  reported: "Para comunicação",
};

export function getAlertLinkLabel(
  alert: Pick<Alert, "id" | "account">,
): string {
  return `Abrir alerta ${alert.id}, conta ${alert.account}`;
}

// Status = ponto colorido + texto na cor do texto (nunca texto colorido).
const statusDots: Record<AlertStatus, string> = {
  pending: "bg-chart-muted",
  escalated: "bg-primary",
  reported: "bg-signal",
  archived: "border border-muted-foreground bg-transparent",
};

export function StatusDot({
  status,
  className = "",
}: {
  status: AlertStatus;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2 shrink-0 rounded-full ${statusDots[status]} ${className}`}
    />
  );
}

export function RiskScore({ value }: { value: number }) {
  const riskLabel = RISK_LABELS[riskLevel(value)];
  const high = isHighRisk(value);
  return (
    <div
      className="inline-flex items-center gap-2.5"
      title={`Nota ${formatScore(value)} de 100 · ${riskLabel}. ${SCORE_HINT}`}
    >
      <span
        className={`w-9 font-medium tabular-nums ${high ? "text-signal" : ""}`}
      >
        {formatScore(value)}
      </span>
      <span className="h-1 w-[72px] overflow-hidden rounded-sm bg-track">
        <span
          className={`block h-full ${high ? "bg-signal" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span className="sr-only">de 100, risco {riskLabel.toLowerCase()}</span>
    </div>
  );
}

export function AlertsTable({
  items,
  onClearFilters,
}: {
  items: Alert[];
  onClearFilters?: () => void;
}) {
  if (!items.length)
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        Nenhum alerta com esses filtros.{" "}
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-foreground underline underline-offset-[3px]"
          >
            Limpar filtros
          </button>
        )}
      </p>
    );
  const head = "px-3 pb-2.5 pt-3 text-xs font-normal border-b border-border";
  const cell = "px-3 py-[13px] border-b border-soft";
  return (
    <div className="overflow-x-auto px-5 py-1">
      <table className="w-full min-w-[860px] border-collapse text-left text-sm tabular-nums">
        <caption className="sr-only">
          Alertas ordenados pela posição na fila
        </caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className={`${head} w-14 pl-0`}>
              Pos.
            </th>
            <th scope="col" className={head}>
              Alerta
            </th>
            <th scope="col" className={head}>
              Conta
            </th>
            <th scope="col" className={head} title={SCORE_HINT}>
              Nota de risco
            </th>
            <th scope="col" className={head}>
              Tipologia
            </th>
            <th scope="col" className={head}>
              País
            </th>
            <th scope="col" className={`${head} text-right`}>
              Valor
            </th>
            <th scope="col" className={`${head} pr-0`}>
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((alert) => (
            <tr
              key={alert.id}
              className="relative cursor-pointer transition-colors hover:bg-soft/60 focus-within:bg-soft/60"
            >
              <td
                className={`${cell} pl-0 font-mono text-xs text-muted-foreground`}
              >
                {alert.queue_position}
              </td>
              <td className={cell}>
                <Link
                  href={"/alerts/" + alert.id}
                  aria-label={getAlertLinkLabel(alert)}
                  className="font-medium underline decoration-border underline-offset-[3px] after:absolute after:inset-0 after:z-10 after:content-[''] hover:decoration-current focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                >
                  {alert.id}
                </Link>
              </td>
              <td className={`${cell} font-mono text-[13px]`}>
                {alert.account}
              </td>
              <td className={cell}>
                <RiskScore value={alert.score} />
              </td>
              <td className={`${cell} text-muted-foreground`}>
                {alert.typology}
              </td>
              <td className={cell}>{alert.country}</td>
              <td className={`${cell} text-right`}>
                {formatCurrency(alert.amount)}
              </td>
              <td className={`${cell} pr-0`}>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <StatusDot status={alert.status} />
                  {statusLabels[alert.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
