"use client";

import { useState } from "react";
import { Database } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  connectionFormSchema,
  type ConnectionForm as ConnectionFormValues,
} from "../schemas/ingestion";

const emptyForm: ConnectionFormValues = {
  name: "",
  host: "",
  port: 5432,
  database: "",
  user: "",
  password: "",
  table: "",
  control_column: "",
};

type FieldErrors = Partial<Record<keyof ConnectionFormValues, string>>;

export function ConnectionForm({
  busy,
  serverError,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  serverError: string;
  onSubmit: (form: ConnectionFormValues) => Promise<boolean>;
  onCancel: () => void;
}) {
  const t = useTranslations("ingestion.form");
  const [values, setValues] = useState<ConnectionFormValues>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});

  function bind(name: keyof ConnectionFormValues) {
    return {
      name,
      value: String(values[name] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setValues((current) => ({ ...current, [name]: e.target.value })),
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = connectionFormSchema.safeParse(values);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ConnectionFormValues;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    const saved = await onSubmit(values);
    // A senha não fica na memória da tela depois de enviada.
    setValues(saved ? emptyForm : { ...values, password: "" });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3.5 pt-3 border-t border-border"
      autoComplete="off"
      noValidate
    >
      <Field label={t("name")} error={errors.name}>
        <Input {...bind("name")} placeholder={t("namePlaceholder")} />
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label={t("host")} error={errors.host}>
          <Input {...bind("host")} placeholder={t("hostPlaceholder")} />
        </Field>
        <Field label={t("port")} error={errors.port}>
          <Input {...bind("port")} inputMode="numeric" />
        </Field>
      </div>
      <Field label={t("database")} error={errors.database}>
        <Input {...bind("database")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("user")} error={errors.user}>
          <Input {...bind("user")} autoComplete="off" />
        </Field>
        <Field label={t("password")} error={errors.password}>
          <Input
            {...bind("password")}
            type="password"
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("table")} error={errors.table}>
          <Input {...bind("table")} placeholder={t("tablePlaceholder")} />
        </Field>
        <Field label={t("control")} error={errors.control_column}>
          <Input
            {...bind("control_column")}
            placeholder={t("controlPlaceholder")}
          />
        </Field>
      </div>
      <p className="m-0 text-xs text-muted-foreground leading-relaxed">
        {t("note")}
      </p>
      {serverError && (
        <p role="alert" className="m-0 text-xs text-signal">
          {serverError}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={busy}>
          <Database className="size-4" strokeWidth={1.5} />
          {busy ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
