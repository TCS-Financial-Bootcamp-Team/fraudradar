import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/config";
import { getT } from "@/i18n/runtime";
import { translateServerMessage } from "@/i18n/server-messages";
import { formatDecimal, formatNumber, formatShortDate } from "@/lib/format";
import {
  importRequestSchema,
  type CompatibilityReport,
  type Connection,
  type ImportMode,
  type ImportRequest,
} from "../schemas/ingestion";

// Regras puras da tela de conexões: textos do relatório, respostas às duas
// perguntas e mensagens de erro. Os componentes só desenham o que sai daqui.

export type Relation = "extend" | "new_dataset";
export type Tone = "ok" | "fail" | "info";

export interface ImportAnswers {
  relation: Relation;
  datasetName: string;
  datasetSlug: string;
  mode: ImportMode;
  controlColumn: string;
}

export const RELATIONS: Relation[] = ["extend", "new_dataset"];
export const MODES: ImportMode[] = ["history", "follow", "both"];

export const relationOptions = (locale: AppLocale = DEFAULT_LOCALE) => {
  const t = getT("ingestion.questions.relation", locale);
  return RELATIONS.map((value) => ({
    value,
    label: t(`${value}.label`),
    hint: t(`${value}.hint`),
  }));
};

export const modeOptions = (locale: AppLocale = DEFAULT_LOCALE) => {
  const t = getT("ingestion.questions.mode", locale);
  return MODES.map((value) => ({
    value,
    label: t(`${value}.label`),
    hint: t(`${value}.hint`),
  }));
};

const ACCENTS = /[̀-ͯ]/g;

export function slugFromName(name: string) {
  return name
    .normalize("NFD")
    .replace(ACCENTS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function buildImportRequest(answers: ImportAnswers): ImportRequest {
  return importRequestSchema.parse({
    relation: answers.relation,
    ...(answers.relation === "new_dataset" && {
      new_dataset: { name: answers.datasetName, slug: answers.datasetSlug },
    }),
    mode: answers.mode,
    control_column: answers.controlColumn.trim(),
  });
}

const KNOWN_CHECKS = [
  "connection",
  "table",
  "columns",
  "types",
  "control",
  "sample",
  "ground_truth",
] as const;

export function reportChecks(
  report: CompatibilityReport,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("ingestion.report.checks", locale);
  return report.checks.map((check) => ({
    key: check.key,
    // O rótulo vem pela chave estável do item; item novo cai no texto do servidor.
    label: (KNOWN_CHECKS as readonly string[]).includes(check.key)
      ? t(check.key as (typeof KNOWN_CHECKS)[number])
      : check.label,
    tone: check.status as Tone,
    detail:
      translateServerMessage(check.code, check.params, check.detail, locale) ??
      check.detail,
  }));
}

export function suggestionText(
  suggestion: NonNullable<CompatibilityReport["suggestion"]>,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  return (
    translateServerMessage(
      suggestion.code,
      suggestion.params,
      suggestion.message,
      locale,
    ) ?? suggestion.message
  );
}

export function overlapSummary(
  report: CompatibilityReport,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const overlap = report.overlap;
  if (!overlap) return null;
  const t = getT("ingestion.report", locale);
  const pct = overlap.known_accounts_pct;
  return {
    accounts:
      pct === null
        ? t("noAccounts")
        : t("accountsKnown", {
            pct: `${formatDecimal(pct, 1, locale)}%`,
            count: overlap.sample_accounts,
          }),
    dates: t(`datesText.${overlap.dates}`),
  };
}

export function formatRows(
  count: number | null,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  return count === null
    ? getT("ingestion.report", locale)("rowsUncounted")
    : formatNumber(count, locale);
}

export function dateRange(
  report: CompatibilityReport,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("ingestion.report", locale);
  if (!report.date_first || !report.date_last) return t("noDates");
  return t("dateRange", {
    from: formatShortDate(report.date_first, locale),
    to: formatShortDate(report.date_last, locale),
  });
}

export function groundTruthText(
  report: CompatibilityReport,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  const t = getT("ingestion.report", locale);
  return report.has_ground_truth ? t("truthYes") : t("truthNo");
}

export function canImport(report: CompatibilityReport | null) {
  return Boolean(report?.compatible);
}

export const statusLabel = (
  status: Connection["status"],
  locale: AppLocale = DEFAULT_LOCALE,
) => getT("ingestion.connections.status", locale)(status);

// Ponto colorido + texto (DESIGN.md): só o erro usa o destaque.
export function statusTone(status: Connection["status"]): Tone {
  if (status === "connected") return "ok";
  if (status === "error" || status === "incompatible") return "fail";
  return "info";
}

export function modeLabel(
  mode: ImportMode | null,
  locale: AppLocale = DEFAULT_LOCALE,
) {
  return (
    modeOptions(locale).find((option) => option.value === mode)?.label ?? ""
  );
}
