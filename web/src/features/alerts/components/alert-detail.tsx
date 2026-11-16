"use client";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, CheckCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { LoadingState, ResourceError } from "@/components/ui/states";
import { useFormatters } from "@/i18n/use-formatters";
import { useValidationText } from "@/i18n/use-validation-text";
import {
  scoreHint,
  formatDayMonth,
  formatQueuePosition,
  formatScore,
  formatWeekLabel,
  isHighRisk,
} from "@/lib/risk";
import { useAlertDetail } from "../hooks/use-alerts";
import {
  approvalSchema,
  decisionSchema,
  type ArchiveReason,
  type DecisionRequest,
  type Report,
} from "../schemas/alerts";
import { ControlSampleBadge, StatusDot } from "./alerts-table";
import { AccountGraph } from "./account-graph";

const DECISION_CHOICES: DecisionRequest["decision"][] = [
  "archive",
  "escalate",
  "report",
];

export const ARCHIVE_REASONS: ArchiveReason[] = [
  "false_positive",
  "insufficient_evidence",
];

const cardClass = "panel grid gap-4 px-[22px] py-5";

function CardTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function AlertDetailView({ id }: { id: string }) {
  const t = useTranslations("alerts.detail");
  const tc = useTranslations("common.status");
  const locale = useLocale();
  const format = useFormatters();
  const text = useValidationText();
  const resource = useAlertDetail(id);
  const form = useForm<DecisionRequest>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: "escalate", justification: "" },
  });
  const chosen = useWatch({ control: form.control, name: "decision" });
  const reason = useWatch({ control: form.control, name: "archive_reason" });
  if (resource.loading) return <LoadingState />;
  if (resource.error || !resource.data)
    return (
      <ResourceError
        message={resource.error ?? t("notFound")}
        onRetry={resource.reload}
      />
    );
  const { detail: alert, graph, report, otherAlerts } = resource.data;
  const isApproved = report?.status === "approved";
  const high = isHighRisk(alert.score);
  const decisionError = text(form.formState.errors.decision?.message);
  const reasonError = text(form.formState.errors.archive_reason?.message);
  const justificationError = form.formState.errors.justification?.message;

  return (
    <div className="flex flex-col gap-7">
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        href="/alerts"
      >
        <ChevronLeft className="size-3.5" strokeWidth={1.5} />
        {t("backToQueue", { week: formatWeekLabel(alert.week, locale) })}
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-[3px]">
              <StatusDot status={alert.status} />
              {tc(alert.status)}
            </span>
            <span className="text-muted-foreground">
              {formatQueuePosition(alert.queue_position, locale)} · {alert.country}
            </span>
            {alert.origin === "exploration" && <ControlSampleBadge />}
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">
            {t("title", { id: alert.id })}{" "}
            <span className="font-mono text-lg font-normal tracking-normal text-muted-foreground">
              {t("account", { account: alert.account })}
            </span>
          </h1>
        </div>
        <dl className="grid grid-cols-3 gap-x-10 gap-y-1 tabular-nums">
          <dt className="text-xs text-muted-foreground" title={scoreHint(locale)}>
            {t("score")}
          </dt>
          <dt className="text-xs text-muted-foreground">{t("weekVolume")}</dt>
          <dt className="text-xs text-muted-foreground">{t("movements")}</dt>
          <dd
            className={`text-[28px] font-medium tracking-[-0.02em] ${high ? "text-signal" : ""}`}
          >
            {formatScore(alert.score, locale)}
          </dd>
          <dd className="text-[28px] font-medium tracking-[-0.02em]">
            {format.currency(alert.amount)}
          </dd>
          <dd className="text-[28px] font-medium tracking-[-0.02em]">
            {alert.transaction_count}
          </dd>
        </dl>
      </header>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-5">
          <section className={cardClass}>
            <CardTitle
              title={t("why")}
              hint={t("whyHint")}
            />
            <ul className="grid gap-3.5">
              {alert.contributions.map((c) => (
                <li
                  key={c.name}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(60px,160px)_48px] items-center gap-4 text-sm"
                >
                  <span>{c.name}</span>
                  <span className="h-2 overflow-hidden rounded bg-track">
                    <span
                      className="block h-full rounded bg-primary"
                      style={{ width: `${c.value}%` }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs">
                    {c.value}%
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={cardClass}>
            <CardTitle title={t("rules")} />
            {alert.rules.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("noRules")}
              </p>
            ) : (
              <ul className="divide-y divide-soft">
                {alert.rules.map((r) => (
                  <li key={r.code} className="flex gap-4 py-3 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">
                      {r.code}
                    </span>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel grid gap-2 px-[22px] pb-2 pt-5">
            <CardTitle title={t("weekMovements")} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm tabular-nums">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-border py-2.5 pr-3 font-normal"
                    >
                      {t("colDate")}
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2.5 font-normal"
                    >
                      {t("colFlow")}
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border px-3 py-2.5 font-normal"
                    >
                      {t("colMeans")}
                    </th>
                    <th
                      scope="col"
                      className="border-b border-border py-2.5 pl-3 text-right font-normal"
                    >
                      {t("colAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {alert.movements.map((m) => (
                    <tr key={m.id} className="[&:last-child>td]:border-b-0">
                      <td className="border-b border-soft py-[13px] pr-3">
                        {formatDayMonth(m.date, locale)}
                      </td>
                      <td className="border-b border-soft px-3 py-[13px] font-mono text-[13px]">
                        {m.sender} → {m.receiver}
                      </td>
                      <td className="border-b border-soft px-3 py-[13px]">
                        {m.payment_type}
                      </td>
                      <td className="border-b border-soft py-[13px] pl-3 text-right">
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: m.currency,
                        }).format(m.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={cardClass}>
            <CardTitle
              title={t("connections")}
              hint={t("connectionsHint")}
            />
            <AccountGraph graph={graph} />
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <section className={cardClass}>
            <CardTitle
              title={t("otherWeeks")}
              hint={t("periods", { count: otherAlerts.length })}
            />
            {otherAlerts.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("noOtherWeeks")}
              </p>
            ) : (
              <ul className="divide-y divide-soft">
                {otherAlerts.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/alerts/${item.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-2 text-[13px] hover:underline"
                    >
                      <span>{t("weekOf", { week: formatWeekLabel(item.week, locale) })}</span>
                      <span className="font-mono text-xs">{formatScore(item.score, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cardClass}>
            <CardTitle title={t("assessment")} hint={t("assessmentHint")} />
            {alert.assessment ? (
              <>
                <p className="whitespace-pre-line text-[13px] leading-relaxed">
                  {alert.assessment.content}
                </p>
                <ul className="grid gap-1.5">
                  {alert.assessment.sources.map((s) => (
                    <li
                      key={s.title}
                      className="rounded-lg bg-soft px-2.5 py-2 text-xs"
                    >
                      <span className="font-medium">{s.title}</span>{" "}
                      <span className="text-muted-foreground">
                        · {s.excerpt}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                {t("assessmentEmpty")}
              </p>
            )}
            <Button
              variant="outline"
              disabled={resource.busy}
              onClick={() => void resource.generateAssessment()}
            >
              <Sparkles strokeWidth={1.5} />
              {resource.busy
                ? t("wait")
                : alert.assessment
                  ? t("regenerate")
                  : t("generate")}
            </Button>
          </section>

          <section className={cardClass}>
            <CardTitle title={t("decision")} />
            <form
              className="grid gap-3.5"
              onSubmit={
                isApproved
                  ? (e) => e.preventDefault()
                  : form.handleSubmit(resource.submitDecision)
              }
            >
              <div
                role="radiogroup"
                aria-label={t("routing")}
                className="grid grid-cols-3 overflow-hidden rounded-lg border border-border"
              >
                {DECISION_CHOICES.map((choice) => {
                  const checked = chosen === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={isApproved}
                      onClick={() => {
                        form.setValue("decision", choice, {
                          shouldValidate: true,
                        });
                        // O motivo só existe no arquivamento: some ao trocar de decisão.
                        if (choice !== "archive")
                          form.setValue("archive_reason", undefined, {
                            shouldValidate: true,
                          });
                      }}
                      className={`min-h-11 border-r border-border px-2 py-1.5 text-[13px] font-medium leading-tight transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                        checked
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground hover:bg-soft"
                      }`}
                    >
                      {t(`choices.${choice}`)}
                    </button>
                  );
                })}
              </div>
              {decisionError && (
                <span role="alert" className="text-xs text-signal">
                  {decisionError}
                </span>
              )}
              {chosen === "archive" && (
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="mb-1.5 text-[13px] font-medium text-foreground">
                    {t("archiveReason")}
                  </legend>
                  <div
                    role="radiogroup"
                    aria-label={t("archiveReason")}
                    className="grid grid-cols-2 overflow-hidden rounded-lg border border-border"
                  >
                    {ARCHIVE_REASONS.map((value) => {
                      const checked = reason === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          disabled={isApproved}
                          onClick={() =>
                            form.setValue("archive_reason", value, {
                              shouldValidate: true,
                            })
                          }
                          className={`min-h-11 border-r border-border px-2 py-1.5 text-[13px] font-medium leading-tight transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                            checked
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-foreground hover:bg-soft"
                          }`}
                        >
                          {t(`reasons.${value}`)}
                        </button>
                      );
                    })}
                  </div>
                  <p className="m-0 text-xs text-muted-foreground">
                    {t("archiveHint")}
                  </p>
                  {reasonError && (
                    <span role="alert" className="text-xs text-signal">
                      {reasonError}
                    </span>
                  )}
                </fieldset>
              )}
              <Field label={t("justification")} error={justificationError}>
                <Textarea
                  rows={3}
                  maxLength={4000}
                  className="bg-background"
                  placeholder={t("justificationPlaceholder")}
                  disabled={isApproved}
                  {...form.register("justification")}
                />
              </Field>
              <Button
                type="submit"
                className="h-11"
                disabled={resource.busy || isApproved}
              >
                {resource.busy ? t("submitting") : t("submit")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {isApproved
                  ? t("closedNote")
                  : t("reportNote")}
              </p>
            </form>
          </section>

          {report && (
            <ReportSection
              key={report.alert_id + report.status}
              report={report}
              onApprove={resource.approveReport}
              busy={resource.busy}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function ReportSection({
  report,
  onApprove,
  busy,
}: {
  report: Report;
  onApprove: (content: string) => Promise<unknown>;
  busy: boolean;
}) {
  const t = useTranslations("alerts.detail.report");
  const [content, setContent] = useState(report.content);
  const [error, setError] = useState("");
  const isApproved = report.status === "approved";

  return (
    <section className="panel grid gap-3 border-foreground px-[22px] py-5">
      <CardTitle
        title={t("title")}
        hint={isApproved ? t("approved") : t("draft")}
      />
      <p className="rounded-lg bg-soft px-2.5 py-2 text-xs">
        <strong className="font-medium">
          {t("simulation")}
        </strong>{" "}
        {t("simulationNote")}
      </p>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const validation = approvalSchema.safeParse({ content });
          if (!validation.success) {
            setError(validation.error.issues[0].message);
            return;
          }
          setError("");
          void onApprove(content);
        }}
      >
        <Field label={t("label")} error={error}>
          <Textarea
            className="min-h-[260px] bg-background font-mono text-xs leading-relaxed"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isApproved}
            readOnly={isApproved}
            maxLength={20000}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          {t("note")}
        </p>
        <Button
          type="submit"
          variant={isApproved ? "outline" : "default"}
          className="h-11"
          disabled={busy || isApproved}
        >
          <CheckCheck strokeWidth={1.5} />
          {busy
            ? t("approving")
            : isApproved
              ? t("approvedButton")
              : t("approve")}
        </Button>
      </form>
    </section>
  );
}
