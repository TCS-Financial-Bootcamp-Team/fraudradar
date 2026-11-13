"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAppContext } from "@/components/app-context";
import { Button } from "@/components/ui/button";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { formatWeekLabel } from "@/lib/risk";
import { useAlertQueue } from "../hooks/use-alerts";
import { AlertsTable } from "./alerts-table";
import { WeekPicker } from "./week-picker";

const PAGE_SIZE = 10;

// Sem contagem por status na resposta da fila, as abas aparecem sem número.
const TABS = [
  { key: "", label: "all" },
  { key: "pending", label: "pending" },
  { key: "escalated", label: "escalated" },
  { key: "reported", label: "reported" },
  { key: "archived", label: "archived" },
] as const;

export function AlertQueue() {
  const { week } = useAppContext();
  // A key zera filtros e página quando a semana muda.
  return <WeeklyAlertQueue key={week} />;
}

function WeeklyAlertQueue() {
  const t = useTranslations("alerts.queue");
  const locale = useLocale();
  const { week } = useAppContext();
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [origin, setOrigin] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queue = useAlertQueue(status, country, page, search, origin);

  function clearFilters() {
    setStatus("");
    setCountry("");
    setOrigin("");
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  const total = queue.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="page-heading">
          <p>{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
        </div>
        <WeekPicker />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border">
        <nav
          aria-label={t("filterByStatus")}
          className="-mb-px flex flex-wrap gap-1"
        >
          {TABS.map((tab) => {
            const active = status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStatus(tab.key);
                  setPage(1);
                }}
                className={`inline-flex h-11 items-center border-b-2 bg-transparent px-3 text-sm transition-colors ${
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`tabs.${tab.label}`)}
              </button>
            );
          })}
        </nav>
        <div className="flex flex-wrap gap-2 pb-2">
          <label className="relative flex items-center">
            <span className="sr-only">{t("searchLabel")}</span>
            <Search
              className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={t("searchLabel")}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              className="h-[38px] w-60 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <select
            aria-label={t("country")}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setPage(1);
            }}
            className="h-[38px] rounded-lg border border-border bg-card pl-3 pr-8 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">{t("allCountries")}</option>
            {queue.data?.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label={t("origin")}
            title={t("originHint")}
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setPage(1);
            }}
            className="h-[38px] rounded-lg border border-border bg-card pl-3 pr-8 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">{t("originAll")}</option>
            <option value="model">{t("originModel")}</option>
            <option value="exploration">{t("originSample")}</option>
          </select>
        </div>
      </div>

      {queue.loading ? (
        <LoadingState />
      ) : queue.error || !queue.data ? (
        <ResourceError
          message={queue.error ?? t("unavailable")}
          onRetry={queue.reload}
        />
      ) : (
        <>
          <section className="panel overflow-hidden !p-0">
            <AlertsTable
              items={queue.data.items}
              onClearFilters={clearFilters}
            />
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
            <span>
              {total === 0
                ? t("none")
                : t("range", { first, last, total })}
              {week && t("weekSuffix", { week: formatWeekLabel(week, locale) })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
