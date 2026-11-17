"use client";

import { Download, Printer, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LegalSourceItem } from "@/components/legal-source-item";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatScore, formatWeekLabel, isHighRisk } from "@/lib/risk";
import { buildAssessmentMarkdown } from "../lib/assessment";
import type { AlertDetail, Assessment } from "../schemas/alerts";

export interface AssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert: Pick<AlertDetail, "id" | "score" | "week" | "typology">;
  assessment: Assessment;
}

export function AssessmentModal({
  open,
  onOpenChange,
  alert,
  assessment,
}: AssessmentModalProps) {
  const t = useTranslations("alerts.detail.assessmentModal");
  const tc = useTranslations("common.actions");
  const locale = useLocale();
  const highRisk = isHighRisk(alert.score);

  function handleDownload() {
    const markdown = buildAssessmentMarkdown(assessment, t("sourcesExportHeading"));
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `parecer-alerta-${alert.id}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label={t("title", { id: alert.id })}>
        <header className="flex flex-col gap-3 border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="m-0 text-lg font-semibold leading-snug tracking-tight text-foreground">
              {t("title", { id: alert.id })}
            </DialogTitle>
            <DialogClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("close")}
                  data-print-hidden="true"
                  className="min-h-9 min-w-9 shrink-0"
                >
                  <X className="size-4" strokeWidth={1.5} />
                </Button>
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("draftBadge")}</Badge>
            <Badge variant="outline" className="font-mono tabular-nums">
              {highRisk && (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-signal"
                />
              )}
              {t("scoreBadge", { score: formatScore(alert.score, locale) })}
            </Badge>
            <Badge variant="outline">
              {t("weekBadge", { week: formatWeekLabel(alert.week, locale) })}
            </Badge>
            {alert.typology && (
              <Badge variant="secondary">
                {t("typologyBadge", { typology: alert.typology })}
              </Badge>
            )}
          </div>
        </header>

        <div
          data-print-dialog-scroll="true"
          className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
        >
          <div className="mx-auto max-w-[70ch] min-w-0">
            <Markdown
              content={assessment.content}
              className="space-y-3 text-sm leading-[1.65] [&_h2]:mt-6 [&_h2]:border-b [&_h2]:border-soft [&_h2]:pb-1.5 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:first:mt-0 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_ul]:space-y-1.5 [&_ul]:pl-6"
            />

            {assessment.sources.length > 0 && (
              <section className="mt-7 border-t border-border pt-5">
                <h3 className="m-0 mb-3 text-sm font-semibold text-foreground">
                  {t("legalSources")}
                </h3>
                <div className="flex flex-col gap-2">
                  {assessment.sources.map((source, index) => (
                    <LegalSourceItem
                      key={`${source.title}-${index}`}
                      source={source}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
          <p className="m-0 text-xs text-muted-foreground">{t("footerNote")}</p>
          <div
            data-print-hidden="true"
            className="flex flex-wrap items-center gap-2"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              onClick={handleDownload}
            >
              <Download className="size-3.5" strokeWidth={1.5} />
              {t("downloadMd")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9"
              onClick={() => window.print()}
            >
              <Printer className="size-3.5" strokeWidth={1.5} />
              {t("printPdf")}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
