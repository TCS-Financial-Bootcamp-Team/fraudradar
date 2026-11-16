"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { useFormatters } from "@/i18n/use-formatters";
import { formatScore } from "@/lib/risk";
import { useSuspiciousAccounts } from "../hooks/use-accounts";
import type { AccountFilters } from "../schemas/accounts";

const COLUMNS = ["account", "maxScore", "latestScore", "periods", "firstLast", "country", "flagged", "status"] as const;

export function SuspiciousAccountsView() {
  const t = useTranslations("accounts");
  const tc = useTranslations("common.status");
  const locale = useLocale();
  const format = useFormatters();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const filters = useMemo<AccountFilters>(
    () => ({
      search: search || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      sort: "max_score_desc",
    }),
    [search, status, from, to, page],
  );
  const resource = useSuspiciousAccounts(filters);
  const pages = Math.max(1, Math.ceil((resource.data?.total ?? 0) / 20));

  return (
    <div className="flex w-full max-w-[1320px] flex-col gap-9">
      <header className="flex flex-col gap-1.5">
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">{t("title")}</h1>
      </header>
      <section className="rounded-[14px] border border-border bg-card p-[20px_22px]">
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_150px_150px]">
          <Input aria-label={t("search")} placeholder={t("search")} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <select aria-label={t("filterStatus")} className="h-10 rounded-lg border border-border bg-card px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">{t("allStatuses")}</option>
            <option value="pending">{tc("pending")}</option>
            <option value="escalated">{tc("escalated")}</option>
            <option value="archived">{tc("archived")}</option>
            <option value="reported">{tc("reported")}</option>
          </select>
          <Input aria-label={t("from")} type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          <Input aria-label={t("to")} type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </div>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error || !resource.data ? (
          <ResourceError message={resource.error ?? t("unavailable")} onRetry={resource.reload} />
        ) : resource.data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {COLUMNS.map((column) => (
                      <th key={column} scope="col" className="border-b border-border px-3 py-2.5 font-normal first:pl-0 last:pr-0">{t(`columns.${column}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((account) => (
                    <tr key={account.account} className="border-b border-soft hover:bg-soft/40">
                      <td className="py-[13px] pr-3 font-mono text-[13px]"><Link className="font-medium underline decoration-border underline-offset-[3px] hover:decoration-foreground" href={`/alerts/${account.latest_alert_id}`}>{account.account}</Link></td>
                      <ScoreCell score={account.max_score} locale={locale} />
                      <td className="px-3 py-[13px] font-medium">{formatScore(account.latest_score, locale)}</td>
                      <td className="px-3 py-[13px] font-mono text-xs">{account.alert_weeks}</td>
                      <td className="px-3 py-[13px] text-xs text-muted-foreground">{format.shortDate(account.first_week)} / {format.shortDate(account.last_week)}</td>
                      <td className="px-3 py-[13px]">{account.country}</td>
                      <td className="px-3 py-[13px] text-right">{format.currency(account.total_flagged_amount)}</td>
                      <td className="py-[13px] pl-3"><span className="inline-flex items-center gap-2"><span className={cn("size-2 rounded-full", account.status === "reported" ? "bg-signal" : account.status === "escalated" ? "bg-warning" : "bg-foreground")} />{tc(account.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("count", { count: resource.data.total })}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("previous")}</Button>
                <span>{t("page", { page, pages })}</span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>{t("next")}</Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function ScoreCell({ score, locale }: { score: number; locale: "pt-BR" | "en" }) {
  return (
    <td className="px-3 py-[13px]">
      <div className="flex items-center gap-2.5">
        <span className="w-8 font-medium">{formatScore(score, locale)}</span>
        <span className="h-1 w-[72px] overflow-hidden rounded-sm bg-track">
          <span className={cn("block h-full rounded-sm", score >= 98 ? "bg-signal" : "bg-primary")} style={{ width: `${score}%` }} />
        </span>
      </div>
    </td>
  );
}
