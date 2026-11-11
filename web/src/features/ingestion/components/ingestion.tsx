"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ProcessingControls } from "@/features/processing/components/processing-controls";
import { ConnectionsCard } from "./connections-card";
import { useCsvUpload, useManualTransaction } from "../hooks/use-ingestion";
import {
  csvHeaders,
  paymentTypes,
  currencies,
  countries,
  transactionSchema,
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
  const manual = useManualTransaction();

  const inputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef("");
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[13px] text-muted-foreground">
            Entrada de transações
          </p>
          <h1 className="m-0 text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-foreground">
            Fontes de dados
          </h1>
        </div>
        {/* Processar agora e, com o modo demonstração ligado, o simulador. */}
        <ProcessingControls />
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

        <ConnectionsCard />
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
