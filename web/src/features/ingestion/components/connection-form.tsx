"use client";

import { useState } from "react";
import { Database } from "lucide-react";
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
      <Field label="Nome da conexão" error={errors.name}>
        <Input {...bind("name")} placeholder="Ex.: Banco do parceiro" />
      </Field>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label="Host" error={errors.host}>
          <Input {...bind("host")} placeholder="localhost" />
        </Field>
        <Field label="Porta" error={errors.port}>
          <Input {...bind("port")} inputMode="numeric" />
        </Field>
      </div>
      <Field label="Banco de dados" error={errors.database}>
        <Input {...bind("database")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Usuário" error={errors.user}>
          <Input {...bind("user")} autoComplete="off" />
        </Field>
        <Field label="Senha" error={errors.password}>
          <Input
            {...bind("password")}
            type="password"
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tabela de origem" error={errors.table}>
          <Input {...bind("table")} placeholder="schema.tabela" />
        </Field>
        <Field label="Coluna de controle" error={errors.control_column}>
          <Input {...bind("control_column")} placeholder="id ou created_at" />
        </Field>
      </div>
      <p className="m-0 text-xs text-muted-foreground leading-relaxed">
        A senha é cifrada ao salvar e nunca aparece de novo. A coluna de
        controle (data/hora ou número crescente) permite ler só o que for novo.
        A leitura é sempre somente leitura.
      </p>
      {serverError && (
        <p role="alert" className="m-0 text-xs text-signal">
          {serverError}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={busy}>
          <Database className="size-4" strokeWidth={1.5} />
          {busy ? "Salvando…" : "Salvar conexão"}
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
