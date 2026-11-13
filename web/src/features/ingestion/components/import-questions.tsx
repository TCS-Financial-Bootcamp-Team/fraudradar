"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useValidationText } from "@/i18n/use-validation-text";
import type { CompatibilityReport, ImportRequest } from "../schemas/ingestion";
import {
  buildImportRequest,
  modeOptions,
  relationOptions,
  slugFromName,
  type ImportAnswers,
} from "../services/connection-model";

function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: Array<{ value: T; label: string; hint: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="m-0 p-0 border-0 grid gap-2">
      <legend className="p-0 mb-1.5 text-[13px] font-medium text-foreground">
        {legend}
      </legend>
      {options.map((option) => (
        <label
          key={option.value}
          className="flex items-start gap-2.5 p-2.5 border border-border rounded-lg cursor-pointer text-xs has-[:checked]:border-primary"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-0.5 accent-primary"
          />
          <span>
            <span className="block font-medium text-foreground">
              {option.label}
            </span>
            <span className="block text-muted-foreground">{option.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ImportQuestions({
  report,
  controlColumn,
  currentDataset,
  busy,
  serverError,
  onConfirm,
}: {
  report: CompatibilityReport;
  controlColumn: string | null;
  currentDataset: string;
  busy: boolean;
  serverError: string;
  onConfirm: (request: ImportRequest) => void;
}) {
  const t = useTranslations("ingestion.questions");
  const locale = useLocale();
  const text = useValidationText();
  const [answers, setAnswers] = useState<ImportAnswers>({
    // A sugestão só pré-seleciona; a resposta continua sendo da pessoa.
    relation: report.suggestion?.relation ?? "extend",
    datasetName: "",
    datasetSlug: "",
    mode: "history",
    controlColumn: controlColumn ?? "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      onConfirm(buildImportRequest(answers));
      setFormError("");
    } catch (error) {
      const issues = (error as { issues?: Array<{ message: string }> }).issues;
      setFormError(text(issues?.[0]?.message) ?? t("checkAnswers"));
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 pt-3 border-t border-border"
    >
      <Choice
        legend={t("q1")}
        name="relation"
        options={relationOptions(locale)}
        value={answers.relation}
        onChange={(relation) => setAnswers((a) => ({ ...a, relation }))}
      />
      {answers.relation === "extend" ? (
        <p className="m-0 text-xs text-muted-foreground">
          {t("destination", { dataset: currentDataset })}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("newName")}>
            <Input
              value={answers.datasetName}
              onChange={(e) => {
                const datasetName = e.target.value;
                setAnswers((a) => ({
                  ...a,
                  datasetName,
                  datasetSlug: slugEdited
                    ? a.datasetSlug
                    : slugFromName(datasetName),
                }));
              }}
              placeholder={t("newNamePlaceholder")}
            />
          </Field>
          <Field label={t("slug")}>
            <Input
              value={answers.datasetSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setAnswers((a) => ({ ...a, datasetSlug: e.target.value }));
              }}
              className="font-mono"
              placeholder={t("slugPlaceholder")}
            />
          </Field>
        </div>
      )}
      <Choice
        legend={t("q2")}
        name="mode"
        options={modeOptions(locale)}
        value={answers.mode}
        onChange={(mode) => setAnswers((a) => ({ ...a, mode }))}
      />
      <Field label={t("control")}>
        <Input
          value={answers.controlColumn}
          onChange={(e) =>
            setAnswers((a) => ({ ...a, controlColumn: e.target.value }))
          }
          className="font-mono"
          placeholder={t("controlPlaceholder")}
        />
      </Field>
      {(formError || serverError) && (
        <p role="alert" className="m-0 text-xs text-signal">
          {formError || serverError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? t("sending") : t("confirm")}
        </Button>
      </div>
    </form>
  );
}
