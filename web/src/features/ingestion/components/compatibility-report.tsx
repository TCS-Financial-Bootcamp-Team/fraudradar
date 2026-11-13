"use client";

import { useLocale, useTranslations } from "next-intl";
import type { CompatibilityReport as Report } from "../schemas/ingestion";
import {
  dateRange,
  formatRows,
  groundTruthText,
  overlapSummary,
  reportChecks,
  suggestionText,
  type Tone,
} from "../services/connection-model";

const dotClass: Record<Tone, string> = {
  ok: "bg-primary",
  fail: "bg-signal",
  info: "bg-muted-foreground",
};
export function CompatibilityReport({ report }: { report: Report }) {
  const t = useTranslations("ingestion.report");
  const locale = useLocale();
  const overlap = overlapSummary(report, locale);
  return (
    <div
      className="flex flex-col gap-3 pt-3 border-t border-border"
      aria-label={t("title")}
    >
      <h3 className="m-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t("title")}
      </h3>
      <ul className="m-0 p-0 list-none divide-y divide-soft border border-border rounded-lg overflow-hidden">
        {reportChecks(report, locale).map((check) => (
          <li key={check.key} className="p-3 flex items-start gap-2.5 text-xs">
            <span
              aria-hidden
              className={`mt-1 size-2 shrink-0 rounded-full ${dotClass[check.tone]}`}
            />
            <div>
              <p className="m-0 font-medium text-foreground">
                {check.label}{" "}
                <span className="font-normal text-muted-foreground">
                  · {t(`tone.${check.tone}`)}
                </span>
              </p>
              <p className="m-0 text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">{t("truth")}</dt>
        <dd className="m-0">{groundTruthText(report, locale)}</dd>
        <dt className="text-muted-foreground">{t("rows")}</dt>
        <dd className="m-0 font-mono tabular-nums">
          {formatRows(report.row_count, locale)}
        </dd>
        <dt className="text-muted-foreground">{t("range")}</dt>
        <dd className="m-0 font-mono tabular-nums">
          {dateRange(report, locale)}
        </dd>
        {overlap && (
          <>
            <dt className="text-muted-foreground">{t("common")}</dt>
            <dd className="m-0">{overlap.accounts}</dd>
            <dt className="text-muted-foreground">{t("dates")}</dt>
            <dd className="m-0">{overlap.dates}</dd>
          </>
        )}
      </dl>
      {report.suggestion && (
        <p className="m-0 p-2.5 text-xs leading-relaxed bg-muted/30 border border-border rounded-lg">
          <span className="font-medium">{t("suggestion")}</span>
          {suggestionText(report.suggestion, locale)}
        </p>
      )}
    </div>
  );
}
