"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "cn";
import { useAppContext } from "@/components/app-context";
import { Pagination } from "@/components/ui/pagination";
import {
  LoadingState,
  RefreshBar,
  ResourceError,
} from "@/components/ui/states";
import {
  PAGE_STATE_MAX_ALERT_IDS,
  PAGE_STATE_MAX_FILTER_STR_LENGTH,
} from "@/features/assistant/schemas/assistant";
import { parsePositiveIntId } from "@/features/assistant/lib/context";
import {
  usePublishPageContext,
  type PublishedPageContext,
} from "@/features/assistant/lib/page-context";
import { pseudonymize } from "@/lib/format";
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

type QueueFilters = {
  week: string;
  status: string;
  country: string;
  origin: string;
  searchInput: string;
  page: number;
};

function emptyFilters(week: string): QueueFilters {
  return {
    week,
    status: "",
    country: "",
    origin: "",
    searchInput: "",
    page: 1,
  };
}

export function AlertQueue() {
  const t = useTranslations("alerts.queue");
  const locale = useLocale();
  const { week } = useAppContext();
  const [filters, setFilters] = useState<QueueFilters>(() => emptyFilters(week));
  const [debouncedSearch, setDebouncedSearch] = useState({ week, value: "" });

  // Zera filtros e página quando a semana muda sem desmontar a tabela (mantém dado anterior).
  const active = filters.week === week ? filters : emptyFilters(week);
  const search = debouncedSearch.week === week ? debouncedSearch.value : "";

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch({ week, value: active.searchInput });
    }, 300);
    return () => clearTimeout(timer);
  }, [week, active.searchInput]);

  const queue = useAlertQueue(
    active.status,
    active.country,
    active.page,
    search,
    active.origin,
  );

  const pageContextValue = useMemo<PublishedPageContext>(() => {
    const publishedFilters: Record<string, string> = {};
    if (week) publishedFilters.week = week.slice(0, PAGE_STATE_MAX_FILTER_STR_LENGTH);
    if (active.status) {
      publishedFilters.status = active.status.slice(
        0,
        PAGE_STATE_MAX_FILTER_STR_LENGTH,
      );
    }
    if (active.country) {
      publishedFilters.country = active.country.slice(
        0,
        PAGE_STATE_MAX_FILTER_STR_LENGTH,
      );
    }
    if (active.origin) {
      publishedFilters.origin = active.origin.slice(
        0,
        PAGE_STATE_MAX_FILTER_STR_LENGTH,
      );
    }
    if (search.trim()) {
      publishedFilters.search = pseudonymize(search.trim()).slice(
        0,
        PAGE_STATE_MAX_FILTER_STR_LENGTH,
      );
    }

    const visibleIds = (queue.data?.items ?? [])
      .map((item) => parsePositiveIntId(item.id))
      .filter((id): id is number => id !== null)
      .slice(0, PAGE_STATE_MAX_ALERT_IDS);

    return {
      pageState: {
        filters: publishedFilters,
        visible_alert_ids: visibleIds,
        page: active.page,
        total: queue.data ? queue.data.total : null,
      },
      visibleCount: queue.data?.items.length ?? 0,
    };
  }, [
    week,
    active.status,
    active.country,
    active.origin,
    search,
    active.page,
    queue.data,
  ]);
  usePublishPageContext(pageContextValue);

  function updateFilters(patch: Partial<QueueFilters>) {
    setFilters((prev) => ({
      ...(prev.week === week ? prev : emptyFilters(week)),
      ...patch,
      week,
    }));
  }

  function clearFilters() {
    setFilters(emptyFilters(week));
    setDebouncedSearch({ week, value: "" });
  }

  const total = queue.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (active.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(active.page * PAGE_SIZE, total);

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
            const isTabActive = active.status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={isTabActive}
                onClick={() => updateFilters({ status: tab.key, page: 1 })}
                className={`inline-flex h-11 items-center border-b-2 bg-transparent px-3 text-sm transition-colors ${
                  isTabActive
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
              value={active.searchInput}
              onChange={(e) =>
                updateFilters({ searchInput: e.target.value, page: 1 })
              }
              className="h-[38px] w-60 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <select
            aria-label={t("country")}
            value={active.country}
            onChange={(e) =>
              updateFilters({ country: e.target.value, page: 1 })
            }
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
            value={active.origin}
            onChange={(e) => updateFilters({ origin: e.target.value, page: 1 })}
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
          <section
            aria-busy={queue.refreshing || undefined}
            className="panel relative overflow-hidden !p-0"
          >
            <RefreshBar active={queue.refreshing} />
            <div
              className={cn(
                "transition-opacity duration-150 motion-reduce:transition-none",
                queue.refreshing && "pointer-events-none opacity-60",
              )}
            >
              <AlertsTable
                items={queue.data.items}
                onClearFilters={clearFilters}
              />
            </div>
          </section>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
            <span>
              {total === 0
                ? t("none")
                : t("range", { first, last, total })}
              {week && t("weekSuffix", { week: formatWeekLabel(week, locale) })}
            </span>
            <Pagination
              page={active.page}
              totalPages={totalPages}
              onPageChange={(nextPage) => updateFilters({ page: nextPage })}
            />
          </div>
        </>
      )}
    </div>
  );
}
