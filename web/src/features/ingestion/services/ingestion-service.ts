import Papa from "papaparse";
import { apiGet, apiMultipart, apiPost, USE_MOCKS } from "@/lib/api";
import {
  compatibilityReportSchema,
  connectionFormSchema,
  connectionSchema,
  connectionsSchema,
  csvHeaders,
  importRequestSchema,
  importResponseSchema,
  jobSchema,
  receiptSchema,
  transactionSchema,
  type ConnectionForm,
  type CsvPreview,
  type ImportRequest,
  type TransactionRequest,
} from "../schemas/ingestion";

export function validateCsvHeaders(fields: string[]) {
  const missing = csvHeaders.filter((h) => !fields.includes(h));
  const extra = fields.filter((h) => !csvHeaders.includes(h));
  if (missing.length || extra.length || fields.length !== csvHeaders.length)
    throw new Error(
      "O CSV deve conter exatamente as 11 colunas transacionais SAML-D. Faltando: " +
        (missing.join(", ") || "nenhuma") +
        ". Remova colunas extras ou duplicadas.",
    );
}
export function prepareCsvPreview(
  file: File,
  signal?: AbortSignal,
): Promise<CsvPreview> {
  if (!file.name.toLowerCase().endsWith(".csv") || !file.size)
    return Promise.reject(new Error("Selecione um arquivo CSV não vazio."));
  return new Promise((resolve, reject) => {
    let activeParser: Papa.Parser | undefined;
    let fields: string[] = [];
    const rows: Record<string, string>[] = [];
    let chunkCount = 0;
    const finish = () => {
      signal?.removeEventListener("abort", handleAbort);
      if (!rows.length) {
        reject(new Error("O CSV não contém transações."));
        return;
      }
      resolve({
        headers: fields,
        rows: rows.slice(0, 20),
        fileName: file.name,
      });
    };
    const handleAbort = () => {
      activeParser?.abort();
      reject(new DOMException("Prévia cancelada", "AbortError"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    Papa.parse<Record<string, string>>(file, {
      header: true,
      preview: 20,
      skipEmptyLines: "greedy",
      chunkSize: 64 * 1024,
      beforeFirstChunk: (chunk) => {
        if (!chunk.includes("\n") && file.size > 64 * 1024) {
          reject(new Error("Cabeçalho inválido ou excessivamente longo."));
          return "";
        }
        return chunk.replace(/^\uFEFF/, "");
      },
      chunk: (result, parser) => {
        activeParser = parser;
        if (signal?.aborted) {
          parser.abort();
          return;
        }
        try {
          if (++chunkCount > 16)
            throw new Error(
              "Linhas excessivamente longas. Revise o formato do CSV.",
            );
          if (result.errors.length)
            throw new Error(
              "CSV inválido: verifique delimitadores, aspas e colunas.",
            );
          fields = result.meta.fields ?? [];
          validateCsvHeaders(fields);
          for (const [index, row] of result.data.entries()) {
            const validation = transactionSchema.safeParse({
              ...row,
              Amount: Number(row.Amount),
            });
            if (!validation.success)
              throw new Error(
                "Linha " +
                  (index + 2) +
                  ": " +
                  validation.error.issues[0].message,
              );
          }
          rows.push(...result.data);
          if (rows.length >= 20) {
            finish();
            parser.abort();
          }
        } catch (error) {
          signal?.removeEventListener("abort", handleAbort);
          reject(error);
          parser.abort();
        }
      },
      complete: finish,
      error: () => {
        signal?.removeEventListener("abort", handleAbort);
        reject(new Error("Não foi possível ler o CSV."));
      },
    });
  });
}
function requireSecureTransport() {
  const url = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error(
      "Credenciais de conexão exigem uma API HTTPS. HTTP é permitido apenas em localhost.",
    );
}
export async function uploadCsv(
  file: File,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
) {
  if (USE_MOCKS) {
    onProgress(100);
    return receiptSchema.parse(
      (await import("./mocks")).receiptMock(
        "Arquivo recebido em demonstração. Nenhum dado foi importado na API.",
      ),
    );
  }
  const formData = new FormData();
  formData.set("file", file);
  return receiptSchema.parse(
    await apiMultipart("/ingestion/csv", formData, onProgress, signal),
  );
}
export async function submitTransaction(data: TransactionRequest) {
  const parsed = transactionSchema.parse(data);
  return receiptSchema.parse(
    USE_MOCKS
      ? (await import("./mocks")).receiptMock(
          "Transação registrada em demonstração.",
        )
      : await apiPost("/ingestion/transactions", parsed),
  );
}
export async function listConnections(signal?: AbortSignal) {
  return connectionsSchema.parse(
    USE_MOCKS
      ? { items: (await import("./mocks")).connectionsMock }
      : await apiGet("/ingestion/connections", { signal }),
  );
}
export async function createConnection(form: ConnectionForm) {
  const parsed = connectionFormSchema.parse(form);
  const body = {
    ...parsed,
    control_column: parsed.control_column || null,
  };
  if (USE_MOCKS) return (await import("./mocks")).createConnectionMock(body);
  requireSecureTransport();
  return connectionSchema.parse(await apiPost("/ingestion/connections", body));
}
export async function testConnection(id: string) {
  if (USE_MOCKS) return (await import("./mocks")).testConnectionMock(id);
  return compatibilityReportSchema.parse(
    await apiPost(
      "/ingestion/connections/" + encodeURIComponent(id) + "/test",
      {},
    ),
  );
}
export async function startImport(id: string, request: ImportRequest) {
  const parsed = importRequestSchema.parse(request);
  if (USE_MOCKS) return (await import("./mocks")).startImportMock(id, parsed);
  return importResponseSchema.parse(
    await apiPost(
      "/ingestion/connections/" + encodeURIComponent(id) + "/import",
      parsed,
    ),
  );
}
export async function fetchJob(id: string, signal?: AbortSignal) {
  if (USE_MOCKS) return (await import("./mocks")).fetchJobMock(id);
  return jobSchema.parse(
    await apiGet("/jobs/" + encodeURIComponent(id), { signal }),
  );
}
