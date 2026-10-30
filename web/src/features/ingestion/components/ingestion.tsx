"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Database, FileUp, Plus, RefreshCw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, LoadingState, ResourceError } from "@/components/ui/states";
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

function CsvUploadTab() {
  const csv = useCsvUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-6">
      <section className="panel p-6">
        <h2 className="mb-2 font-semibold">Importar transações</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Escolha um CSV no formato SAML-D. A prévia lê até 20 linhas; a API
          valida o arquivo completo.
        </p>
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center sm:p-12"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!csv.busy && e.dataTransfer.files[0])
              void csv.selectFile(e.dataTransfer.files[0]);
          }}
        >
          <UploadCloud className="mx-auto mb-4 size-10 text-primary" />
          <h3 className="font-medium">Arraste seu arquivo CSV até aqui</h3>
          <p className="mb-5 mt-2 text-xs text-muted-foreground">
            ou selecione um arquivo do seu computador
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
            disabled={csv.busy}
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <FileUp />
            Selecionar CSV
          </Button>
        </div>
        <details className="mt-5 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Ver as 11 colunas obrigatórias
          </summary>
          <p className="mt-3 break-words font-mono leading-loose">
            {csvHeaders.join(", ")}
          </p>
        </details>
        {csv.reading && (
          <p className="mt-4 text-sm" role="status">
            Validando a prévia…
          </p>
        )}
        {csv.error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {csv.error}
          </p>
        )}
      </section>
      {csv.preview && (
        <section className="panel overflow-hidden">
          <div className="panel-title">
            <h2 className="truncate">Prévia · {csv.preview.fileName}</h2>
            <span className="shrink-0 text-xs font-normal text-muted-foreground">
              {csv.preview.rows.length} linhas
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {csv.preview.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csv.preview.rows.map((row, i) => (
                  <tr key={i}>
                    {csv.preview?.headers.map((header) => (
                      <td key={header}>
                        {header.endsWith("_account")
                          ? "••••" + row[header].slice(-4)
                          : row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 border-t p-6">
            <p className="text-xs text-muted-foreground">
              A validação local cobre apenas esta amostra. A API deve rejeitar
              linhas inválidas e colunas não permitidas em todo o arquivo.
            </p>
            {(csv.busy || csv.completed) && (
              <div>
                <label className="mb-2 block text-xs" htmlFor="csv-progress">
                  {csv.completed
                    ? "Recebimento confirmado"
                    : csv.progress === 100
                      ? "Arquivo enviado. Aguardando confirmação…"
                      : "Enviando arquivo… " + csv.progress + "%"}
                </label>
                <progress
                  className="h-2 w-full accent-primary"
                  id="csv-progress"
                  max={100}
                  value={csv.progress}
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button
                disabled={csv.busy || csv.completed || csv.reading}
                onClick={() => void csv.upload()}
              >
                <UploadCloud />
                {csv.busy
                  ? "Enviando…"
                  : csv.completed
                    ? "Arquivo recebido"
                    : "Enviar arquivo para ingestão"}
              </Button>
              {csv.busy && (
                <Button variant="outline" onClick={csv.cancel}>
                  Cancelar envio
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
function ConnectionsTab() {
  const sources = useDataSources();
  const [mode, setMode] = useState("uri");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    let uri = String(formData.get("uri") ?? "");
    if (mode === "fields") {
      const port = String(formData.get("port"));
      if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
        setError("Informe uma porta entre 1 e 65535.");
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
      setError(validation.error.issues[0].message);
      return;
    }
    // Credenciais não são guardadas no estado nem no armazenamento do navegador.
    try {
      if (await sources.register(validation.data)) form.reset();
    } finally {
      for (const fieldName of ["uri", "password"]) {
        const inputElement = form.elements.namedItem(fieldName);
        if (inputElement instanceof HTMLInputElement) inputElement.value = "";
      }
      uri = "";
      payload.connection_string = "";
    }
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="panel">
        <h2 className="panel-title">Cadastrar fonte Postgres</h2>
        <form
          ref={formRef}
          onSubmit={handleRegister}
          className="grid gap-5 p-6"
          autoComplete="off"
        >
          <Field label="Nome da fonte">
            <Input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex.: Operações de produção"
            />
          </Field>
          <Field label="Tipo de banco">
            <Select name="type">
              <option>Postgres</option>
            </Select>
          </Field>
          <Field label="Como deseja conectar?">
            <Select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="uri">Connection string</option>
              <option value="fields">Host, porta e credenciais</option>
            </Select>
          </Field>
          {mode === "uri" ? (
            <Field label="Connection string">
              <Input
                type="password"
                name="uri"
                autoComplete="new-password"
                required
                placeholder="postgresql://usuario:senha@host:5432/banco"
              />
            </Field>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
                <Field label="Host">
                  <Input name="host" required placeholder="db.exemplo.com" />
                </Field>
                <Field label="Porta">
                  <Input
                    name="port"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={5432}
                    required
                  />
                </Field>
              </div>
              <Field label="Banco de dados">
                <Input name="database" required />
              </Field>
              <Field label="Usuário">
                <Input name="username" autoComplete="off" required />
              </Field>
              <Field label="Senha">
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
              </Field>
            </>
          )}
          <label className="flex items-center gap-3 text-sm">
            <input
              className="size-4 accent-primary"
              type="checkbox"
              name="ssl"
              defaultChecked
            />
            Exigir conexão SSL
          </label>
          <p className="notice text-xs">
            As credenciais são enviadas uma única vez para a API via HTTPS. Após
            o cadastro, apenas host e banco mascarados são exibidos. Use um
            usuário de banco com acesso somente de leitura.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={sources.busy}>
            <Database />
            {sources.busy ? "Registrando…" : "Registrar fonte"}
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2 className="panel-title">Fontes registradas</h2>
        {sources.loading ? (
          <div className="p-6">
            <LoadingState />
          </div>
        ) : sources.error ? (
          <ResourceError message={sources.error} onRetry={sources.reload} />
        ) : !sources.data?.items.length ? (
          <EmptyState
            title="Nenhuma fonte cadastrada"
            description="Cadastre um banco Postgres para iniciar a ingestão."
          />
        ) : (
          <div className="divide-y px-6">
            {sources.data.items.map((source) => (
              <article key={source.id} className="grid gap-3 py-5">
                <div className="flex justify-between gap-3">
                  <h3 className="text-sm font-semibold">{source.name}</h3>
                  <span
                    className={`text-xs ${source.status === "error" ? "text-destructive" : "text-primary"}`}
                  >
                    {source.status === "connected"
                      ? "Conectada"
                      : source.status === "error"
                        ? "Falha de conexão"
                        : "Sincronizando"}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {source.masked_host} / {source.masked_database}
                </p>
                <p className="text-xs text-muted-foreground">
                  Última sincronização:{" "}
                  {source.last_synced_at
                    ? formatShortDate(source.last_synced_at)
                    : "ainda não realizada"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={sources.busy || source.status === "syncing"}
                  onClick={() => void sources.sync(source.id)}
                >
                  <RefreshCw />
                  Sincronizar
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
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
function ManualTransactionTab() {
  const manual = useManualTransaction();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransactionRequest>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      Payment_currency: "BRL",
      Received_currency: "BRL",
      Time: "12:00:00",
    },
  });
  return (
    <div className="grid gap-6">
      <section className="panel">
        <h2 className="panel-title">Adicionar uma transação</h2>
        <form
          className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={handleSubmit(async (data) => {
            if (await manual.submit(data)) reset();
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
              error={errors[fieldKey]?.message}
            >
              <Input
                {...register(
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
          <div className="flex items-end sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={manual.busy}>
              <Plus />
              {manual.busy ? "Registrando…" : "Registrar transação"}
            </Button>
          </div>
        </form>
      </section>
      <section className="panel overflow-hidden">
        <h2 className="panel-title">
          Registros desta sessão · {manual.entries.length}
        </h2>
        {!manual.entries.length ? (
          <EmptyState
            title="Nenhuma transação registrada"
            description="Os registros enviados por este formulário aparecerão aqui durante a sessão."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Origem</th>
                  <th>Destino</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {manual.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="font-mono">{entry.sender}</td>
                    <td className="font-mono">{entry.receiver}</td>
                    <td>
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: entry.currency,
                      }).format(entry.amount)}
                    </td>
                    <td>Recebido</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
export function Ingestion() {
  const [activeTab, setActiveTab] = useState("csv");
  const tabs = [
    { id: "csv", label: "Upload de CSV", icon: FileUp },
    { id: "connections", label: "Conexão com banco", icon: Database },
    { id: "manual", label: "Formulário manual", icon: Plus },
  ];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow !mt-0 mb-2">Entrada de operações</p>
          <h1>Fontes de dados</h1>
          <p>
            Conecte suas operações ao monitoramento com controle e visibilidade.
          </p>
        </div>
      </div>
      <div
        role="tablist"
        aria-label="Método de ingestão"
        className="flex overflow-x-auto border-b"
      >
        {tabs.map(({ id, label, icon: IconComponent }, i) => (
          <button
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            key={id}
            id={"tab-" + id}
            role="tab"
            aria-controls={"panel-" + id}
            aria-selected={activeTab === id}
            tabIndex={activeTab === id ? 0 : -1}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const nextIndex =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 2
                    : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
              setActiveTab(tabs[nextIndex].id);
              tabRefs.current[nextIndex]?.focus();
            }}
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-4 text-xs font-medium ${activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            <IconComponent className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {tabs.map(({ id }) => (
        <div
          key={id}
          id={"panel-" + id}
          role="tabpanel"
          aria-labelledby={"tab-" + id}
          hidden={activeTab !== id}
        >
          {id === "csv" ? (
            <CsvUploadTab />
          ) : id === "connections" ? (
            <ConnectionsTab />
          ) : (
            <ManualTransactionTab />
          )}
        </div>
      ))}
    </>
  );
}
