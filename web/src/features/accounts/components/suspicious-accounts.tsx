"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { formatScore } from "@/lib/risk";
import { useSuspiciousAccounts } from "../hooks/use-accounts";
import type { AccountFilters } from "../schemas/accounts";

const statusLabels = {
  pending: "Pendente",
  escalated: "Em investigação",
  archived: "Arquivado",
  reported: "Para comunicação",
};

export function SuspiciousAccountsView() {
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
        <p className="text-[13px] text-muted-foreground">Todos os períodos processados</p>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em]">Contas suspeitas</h1>
      </header>
      <section className="rounded-[14px] border border-border bg-card p-[20px_22px]">
        <div className="mb-5 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_150px_150px]">
          <Input aria-label="Buscar conta" placeholder="Buscar conta" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <select aria-label="Filtrar por status" className="h-10 rounded-lg border border-border bg-card px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="">Todos os status</option>
            <option value="pending">Pendente</option>
            <option value="escalated">Em investigação</option>
            <option value="archived">Arquivado</option>
            <option value="reported">Para comunicação</option>
          </select>
          <Input aria-label="Período inicial" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          <Input aria-label="Período final" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </div>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error || !resource.data ? (
          <ResourceError message={resource.error ?? "Contas indisponíveis."} onRetry={resource.reload} />
        ) : resource.data.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    {['Conta', 'Maior nota', 'Nota recente', 'Períodos', 'Primeiro / último', 'País principal', 'Valor sinalizado', 'Status'].map((label) => (
                      <th key={label} scope="col" className="border-b border-border px-3 py-2.5 font-normal first:pl-0 last:pr-0">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((account) => (
                    <tr key={account.account} className="border-b border-soft hover:bg-soft/40">
                      <td className="py-[13px] pr-3 font-mono text-[13px]"><Link className="font-medium underline decoration-border underline-offset-[3px] hover:decoration-foreground" href={`/alerts/${account.latest_alert_id}`}>{account.account}</Link></td>
                      <ScoreCell score={account.max_score} />
                      <td className="px-3 py-[13px] font-medium">{formatScore(account.latest_score)}</td>
                      <td className="px-3 py-[13px] font-mono text-xs">{account.alert_weeks}</td>
                      <td className="px-3 py-[13px] text-xs text-muted-foreground">{formatShortDate(account.first_week)} / {formatShortDate(account.last_week)}</td>
                      <td className="px-3 py-[13px]">{account.country}</td>
                      <td className="px-3 py-[13px] text-right">{formatCurrency(account.total_flagged_amount)}</td>
                      <td className="py-[13px] pl-3"><span className="inline-flex items-center gap-2"><span className={cn("size-2 rounded-full", account.status === "reported" ? "bg-signal" : account.status === "escalated" ? "bg-warning" : "bg-foreground")} />{statusLabels[account.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{resource.data.total} conta(s)</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button>
                <span>Página {page} de {pages}</span>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}

function ScoreCell({ score }: { score: number }) {
  return (
    <td className="px-3 py-[13px]">
      <div className="flex items-center gap-2.5">
        <span className="w-8 font-medium">{formatScore(score)}</span>
        <span className="h-1 w-[72px] overflow-hidden rounded-sm bg-track">
          <span className={cn("block h-full rounded-sm", score >= 98 ? "bg-signal" : "bg-primary")} style={{ width: `${score}%` }} />
        </span>
      </div>
    </td>
  );
}
