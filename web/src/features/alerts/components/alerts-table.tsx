"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AccountLabel } from "@/components/account-label";
import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { useFormatters } from "@/i18n/use-formatters";
import { getT } from "@/i18n/runtime";
import { formatScore, isHighRisk, riskLabel, riskLevel, scoreHint } from "@/lib/risk";
import type { Alert, AlertStatus } from "../schemas/alerts";

export function getAlertLinkLabel(
  alert: Pick<Alert, "id" | "account"> & Partial<Pick<Alert, "origin">>,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  const t = getT("alerts", locale);
  return t("table.linkLabel", {
    id: alert.id,
    account: alert.account,
    sample: alert.origin === "exploration" ? t("controlSample.linkSuffix") : "",
  });
}

// Texto em pt-BR, o idioma padrão (a tela usa a mensagem no idioma ativo).
export const CONTROL_SAMPLE_HINT = getT("alerts.controlSample")("hint");

/** Selo discreto da amostra de controle; a explicação aparece ao passar o mouse ou focar. */
export function ControlSampleBadge() {
  const t = useTranslations("alerts.controlSample");
  return (
    <span
      title={t("hint")}
      tabIndex={0}
      aria-label={t("ariaLabel", { hint: t("hint").toLowerCase() })}
      className="relative z-20 inline-flex h-5 items-center rounded-full border border-border px-2 text-[11px] font-normal text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {t("label")}
    </span>
  );
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
  const t = useTranslations("alerts.table");
  const locale = useLocale();
  const level = riskLabel(riskLevel(value), locale);
  const high = isHighRisk(value);
  return (
    <div
      className="inline-flex items-center gap-2.5"
      title={t("scoreTitle", {
        score: formatScore(value, locale),
        level,
        hint: scoreHint(locale),
      })}
    >
      <span
        className={`w-9 font-medium tabular-nums ${high ? "text-signal" : ""}`}
      >
        {formatScore(value, locale)}
      </span>
      <span className="h-1 w-[72px] overflow-hidden rounded-sm bg-track">
        <span
          className={`block h-full ${high ? "bg-signal" : "bg-primary"}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
      <span className="sr-only">
        {t("scoreSr", { level: level.toLowerCase() })}
      </span>
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
  const t = useTranslations("alerts.table");
  const tc = useTranslations("common.status");
  const locale = useLocale();
  const format = useFormatters();
  if (!items.length)
    return (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">
        {t("empty")}{" "}
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-foreground underline underline-offset-[3px]"
          >
            {t("clearFilters")}
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
          {t("caption")}
        </caption>
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className={`${head} w-14 pl-0`}>
              {t("columns.position")}
            </th>
            <th scope="col" className={head}>
              {t("columns.alert")}
            </th>
            <th scope="col" className={head}>
              {t("columns.account")}
            </th>
            <th scope="col" className={head} title={scoreHint(locale)}>
              {t("columns.score")}
            </th>
            <th scope="col" className={head}>
              {t("columns.typology")}
            </th>
            <th scope="col" className={head}>
              {t("columns.country")}
            </th>
            <th scope="col" className={`${head} text-right`}>
              {t("columns.amount")}
            </th>
            <th scope="col" className={`${head} pr-0`}>
              {t("columns.status")}
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
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Link
                    href={"/alerts/" + alert.id}
                    aria-label={getAlertLinkLabel(alert, locale)}
                    className="font-medium underline decoration-border underline-offset-[3px] after:absolute after:inset-0 after:z-10 after:content-[''] hover:decoration-current focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    {alert.id}
                  </Link>
                  {alert.origin === "exploration" && <ControlSampleBadge />}
                </span>
              </td>
              <td className={cell}>
                <AccountLabel account={alert.account} />
              </td>
              <td className={cell}>
                <RiskScore value={alert.score} />
              </td>
              <td className={`${cell} text-muted-foreground`}>
                {alert.typology}
              </td>
              <td className={cell}>{alert.country}</td>
              <td className={`${cell} text-right`}>
                {format.currency(alert.amount)}
              </td>
              <td className={`${cell} pr-0`}>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <StatusDot status={alert.status} />
                  {tc(alert.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
