"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database, FileUp, Plus, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { formatShortDate } from "@/lib/format";
import {
  useCsvUpload,
  useDataSources,
  useManualTransaction,
} from "../hooks/use-ingestion";
import {
  csvHeaders,
  connectionSchema,
  paymentTypes,
  currencies,
  countries,
  transactionSchema,
  type ConnectionRequest,
  type TransactionRequest,
} from "../schemas/ingestion";

interface RecentUpload {
  id: string;
  file: string;
  when: string;
}

const transactionFieldLabels: Record<keyof TransactionRequest, string> = {
  Date: "Data",
  Time: "Horário",
  Sender_account: "Conta de origem",
  Receiver_account: "Conta de destino",
  Amount: "Valor",
  Payment_currency: "Moeda do pagamento",
  Received_currency: "Moeda do recebimento",
  Sender_bank_location: "País do banco de origem",
  Receiver_bank_location: "País do banco de destino",
  Payment_type: "Meio de pagamento",
};

export function Ingestion() {
  const csv = useCsvUpload();
  const sources = useDataSources();
  const manual = useManualTransaction();

  const inputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef("");
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connMode, setConnMode] = useState<"uri" | "fields">("uri");
  const [connError, setConnError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const {
    register: registerManual,
    handleSubmit: handleManualSubmit,
    reset: resetManual,
    formState: { errors: manualErrors },
  } = useForm<TransactionRequest>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      Payment_currency: "BRL",
      Received_currency: "BRL",
      Time: "12:00:00",
    },
  });

  const handleUploadClick = async () => {
    if (!csv.preview || csv.busy) return;
    lastFileRef.current = csv.preview.fileName;
    await csv.upload();
  };

  // Só registra o envio quando o upload termina com sucesso (csv.completed).
  useEffect(() => {
    if (!csv.completed || !lastFileRef.current) return;
    const file = lastFileRef.current;
    lastFileRef.current = "";
    setRecentUploads((prev) => [
      {
        id: `#${prev.length + 1}`,
        file,
        when: new Date().toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      },
      ...prev,
    ]);
  }, [csv.completed]);

  async function handleRegisterSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setConnError("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    let uri = String(formData.get("uri") ?? "");
    if (connMode === "fields") {
      const port = String(formData.get("port"));
      if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        setConnError("Informe uma porta entre 1 e 65535.");
        return;
      }
      uri =
        "postgresql://" +
        encodeURIComponent(String(formData.get("username"))) +
        ":" +
        encodeURIComponent(String(formData.get("password"))) +
        "@" +
        String(formData.get("host")).trim() +
        ":" +
        port +
        "/" +
        encodeURIComponent(String(formData.get("database")));
    }
    const payload: ConnectionRequest = {
      name: String(formData.get("name")),
      type: "postgres",
      connection_string: uri,
      ssl: formData.get("ssl") === "on",
    };
    const validation = connectionSchema.safeParse(payload);
    if (!validation.success) {
      setConnError(validation.error.issues[0].message);
      return;
    }
    try {
      if (await sources.register(validation.data)) {
        form.reset();
        setShowConnectionForm(false);
      }
    } finally {
      for (const fieldName of ["uri", "password"]) {
        const inputElement = form.elements.namedItem(fieldName);
        if (inputElement instanceof HTMLInputElement) inputElement.value = "";
      }
    }
  }

  // Verifica se a API respondeu 501 / não implementado
  const is501 =
    Boolean(sources.error) &&
    (Boolean(sources.error?.includes("501")) ||
      Boolean(sources.error?.toLowerCase().includes("não implementado")) ||
      Boolean(sources.error?.toLowerCase().includes("not implemented")));

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[13px] text-muted-foreground">
          Entrada de transações
        </p>
        <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
          Fontes de dados
        </h1>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Card 1: Importar CSV */}
        <article className="bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-4">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            Importar CSV
          </h2>

          <div
            className="border-[1.5px] border-dashed border-border rounded-xl p-8 sm:p-10 flex flex-col items-center gap-2.5 text-center bg-background"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!csv.busy && e.dataTransfer.files[0]) {
                void csv.selectFile(e.dataTransfer.files[0]);
              }
            }}
          >
            <Upload
              className="size-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="m-0 font-medium text-foreground">
              Arraste o arquivo até aqui
            </p>
            <p className="m-0 text-[13px] text-muted-foreground max-w-sm">
              CSV no formato do SAML-D, sem as colunas de avaliação. Até 20 MB
              ou 200 mil linhas; tudo ou nada.
            </p>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo CSV"
              disabled={csv.busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void csv.selectFile(e.target.files[0]);
                e.target.value = "";
              }}
            />

            <Button
              type="button"
              disabled={csv.busy}
              onClick={() => inputRef.current?.click()}
              className="mt-1.5"
            >
              <FileUp className="size-4" strokeWidth={1.5} />
              Escolher arquivo
            </Button>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Ver as 11 colunas obrigatórias
            </summary>
            <p className="mt-2.5 break-words font-mono leading-relaxed text-[11px] p-2 bg-muted/30 rounded border border-border">
              {csvHeaders.join(", ")}
            </p>
          </details>

          {csv.reading && (
            <p className="m-0 text-sm text-muted-foreground" role="status">
              Validando a prévia…
            </p>
          )}

          {csv.error && (
            <p role="alert" className="m-0 text-sm text-signal">
              {csv.error}
            </p>
          )}

          {csv.preview && (
            <div className="flex flex-col gap-3 pt-3 border-t border-border">
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono truncate max-w-[200px]">
                  {csv.preview.fileName}
                </span>
                <span className="text-muted-foreground">
                  {csv.preview.rows.length} linhas na prévia
                </span>
              </div>

              <div className="max-h-48 overflow-auto border border-border rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border sticky top-0">
                    <tr>
                      {csv.preview.headers.map((h) => (
                        <th
                          key={h}
                          className="p-2 font-normal whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-soft font-mono">
                    {csv.preview.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        {csv.preview?.headers.map((h) => (
                          <td
                            key={h}
                            className="p-2 whitespace-nowrap text-muted-foreground"
                          >
                            {h.endsWith("_account")
                              ? "••••" + row[h].slice(-4)
                              : row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(csv.busy || csv.completed) && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {csv.completed
                        ? "Recebimento confirmado"
                        : csv.progress === 100
                          ? "Arquivo enviado. Aguardando confirmação…"
                          : "Enviando arquivo…"}
                    </span>
                    <span className="font-mono">{csv.progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-track rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${csv.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  disabled={csv.busy || csv.completed || csv.reading}
                  onClick={() => void handleUploadClick()}
                >
                  {csv.busy
                    ? "Enviando…"
                    : csv.completed
                      ? "Arquivo recebido"
                      : "Enviar arquivo para ingestão"}
                </Button>
                {csv.busy && (
                  <Button variant="outline" onClick={csv.cancel}>
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          )}
        </article>

        {/* Card 2: Conexões com bancos externos */}
        <article className="bg-card border border-border rounded-[14px] p-[20px_22px] flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="m-0 text-sm font-semibold text-foreground">
              Conexões com bancos externos
            </h2>
            <span className="text-xs px-2 py-0.5 border border-border rounded-full text-muted-foreground">
              em breve
            </span>
          </div>

          <p className="m-0 text-[13px] text-muted-foreground leading-relaxed">
            Ler transações direto de um Postgres do banco. Precisa de um desenho
            de segurança próprio (credenciais, rede, escopo de leitura) antes de
            existir.
          </p>

          {is501 && (
            <p className="text-xs text-muted-foreground p-2.5 bg-muted/20 border border-border rounded-lg">
              Endpoint não implementado na API (501). Funcionalidade prevista
              para próximas versões.
            </p>
          )}

          {/* Se houver fontes cadastradas */}
          {sources.data?.items && sources.data.items.length > 0 ? (
            <div className="flex flex-col gap-3 pt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Fontes cadastradas
              </h3>
              <div className="divide-y divide-soft border border-border rounded-lg overflow-hidden">
                {sources.data.items.map((src) => (
                  <div
                    key={src.id}
                    className="p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="m-0 font-medium text-foreground">
                        {src.name}
                      </p>
                      <p className="m-0 font-mono text-muted-foreground">
                        {src.masked_host} / {src.masked_database}
                      </p>
                      {src.last_synced_at && (
                        <p className="m-0 text-[11px] text-muted-foreground">
                          Última sincronização:{" "}
                          {formatShortDate(src.last_synced_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className={`size-2 rounded-full ${
                            src.status === "connected"
                              ? "bg-primary"
                              : "bg-signal"
                          }`}
                        />
                        {src.status === "connected" ? "Conectada" : "Erro"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sources.busy}
                        onClick={() => void sources.sync(src.id)}
                      >
                        <RefreshCw className="size-3" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {showConnectionForm ? (
            <form
              ref={formRef}
              onSubmit={handleRegisterSource}
              className="flex flex-col gap-3.5 pt-3 border-t border-border"
              autoComplete="off"
            >
              <Field label="Nome da fonte">
                <Input
                  name="name"
                  required
                  placeholder="Ex.: Operações de produção"
                />
              </Field>
              <Field label="Como deseja conectar?">
                <Select
                  value={connMode}
                  onChange={(e) =>
                    setConnMode(e.target.value as "uri" | "fields")
                  }
                >
                  <option value="uri">Connection string</option>
                  <option value="fields">Host, porta e credenciais</option>
                </Select>
              </Field>
              {connMode === "uri" ? (
                <Field label="Connection string">
                  <Input
                    type="password"
                    name="uri"
                    required
                    placeholder="postgresql://usuario:senha@host:5432/banco"
                  />
                </Field>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <Field label="Host">
                      <Input
                        name="host"
                        required
                        placeholder="db.exemplo.com"
                      />
                    </Field>
                    <Field label="Porta">
                      <Input
                        name="port"
                        type="number"
                        defaultValue={5432}
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Banco de dados">
                    <Input name="database" required />
                  </Field>
                  <Field label="Usuário">
                    <Input name="username" required />
                  </Field>
                  <Field label="Senha">
                    <Input type="password" name="password" required />
                  </Field>
                </>
              )}
              {connError && (
                <p className="text-xs text-signal m-0">{connError}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={sources.busy}>
                  <Database className="size-4" strokeWidth={1.5} />
                  {sources.busy ? "Registrando…" : "Registrar"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setShowConnectionForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              disabled
              className="self-start h-10 px-4 border border-border rounded-lg bg-transparent text-muted-foreground opacity-70 text-sm font-medium cursor-not-allowed"
            >
              Nova conexão
            </button>
          )}
        </article>
      </section>

      {/* Envios recentes */}
      <section className="bg-card border border-border rounded-[14px] p-[20px_22px_12px] flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold text-foreground">
          Envios recentes
        </h2>
        {recentUploads.length === 0 ? (
          <p className="m-0 pb-4 text-xs text-muted-foreground">
            Nenhum envio nesta sessão.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="font-normal py-2.5 pr-3">Nº</th>
                  <th className="font-normal py-2.5 px-3">Arquivo</th>
                  <th className="font-normal py-2.5 px-3">Enviado</th>
                  <th className="font-normal py-2.5 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentUploads.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-soft last:border-b-0"
                  >
                    <td className="py-3.5 pr-3 font-mono text-xs text-foreground">
                      {u.id}
                    </td>
                    <td className="py-3.5 px-3 font-mono text-[13px] text-foreground">
                      {u.file}
                    </td>
                    <td className="py-3.5 px-3 text-muted-foreground text-xs">
                      {u.when}
                    </td>
                    <td className="py-3.5 pl-3">
                      <span className="inline-flex items-center gap-2 text-foreground">
                        <span className="size-2 rounded-full bg-primary" />
                        Enviado
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Formulário de transação individual (mantido e reestilizado) */}
      <details className="group bg-card border border-border rounded-[14px] p-[20px_22px]">
        <summary className="flex justify-between items-center cursor-pointer font-semibold text-sm text-foreground list-none select-none">
          <span>Adicionar transação individual (registro manual)</span>
          <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">
            ▼
          </span>
        </summary>

        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-4 mt-3 border-t border-border"
          onSubmit={handleManualSubmit(async (data) => {
            if (await manual.submit(data)) resetManual();
          })}
        >
          {(
            Object.keys(transactionFieldLabels) as Array<
              keyof TransactionRequest
            >
          ).map((fieldKey) => (
            <Field
              key={fieldKey}
              label={transactionFieldLabels[fieldKey]}
              error={manualErrors[fieldKey]?.message}
            >
              <Input
                {...registerManual(
                  fieldKey,
                  fieldKey === "Amount" ? { valueAsNumber: true } : {},
                )}
                type={
                  fieldKey === "Date"
                    ? "date"
                    : fieldKey === "Time"
                      ? "time"
                      : fieldKey === "Amount"
                        ? "number"
                        : "text"
                }
                step={
                  fieldKey === "Amount"
                    ? "0.01"
                    : fieldKey === "Time"
                      ? "1"
                      : undefined
                }
                min={fieldKey === "Amount" ? "0.01" : undefined}
                list={
                  fieldKey.includes("currency")
                    ? "currencies"
                    : fieldKey.includes("location")
                      ? "countries"
                      : fieldKey === "Payment_type"
                        ? "payment-types"
                        : undefined
                }
                placeholder={
                  fieldKey.includes("currency") ||
                  fieldKey.includes("location") ||
                  fieldKey === "Payment_type"
                    ? "Digite para buscar…"
                    : undefined
                }
                autoComplete="off"
              />
            </Field>
          ))}
          <datalist id="currencies">
            {currencies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="countries">
            {countries.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="payment-types">
            {paymentTypes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          <div className="flex items-end sm:col-span-2 lg:col-span-3 pt-2">
            <Button type="submit" disabled={manual.busy}>
              <Plus className="size-4" strokeWidth={1.5} />
              {manual.busy ? "Registrando…" : "Registrar transação"}
            </Button>
          </div>
        </form>

        {manual.entries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2">Origem</th>
                  <th className="py-2">Destino</th>
                  <th className="py-2">Valor</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-soft font-mono">
                {manual.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2">{entry.sender}</td>
                    <td className="py-2">{entry.receiver}</td>
                    <td className="py-2">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: entry.currency,
                      }).format(entry.amount)}
                    </td>
                    <td className="py-2 font-sans text-muted-foreground">
                      Recebido
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
