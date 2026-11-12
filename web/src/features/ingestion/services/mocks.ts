import { createJobMock } from "@/features/jobs/services/mocks";
import type {
  CompatibilityReport,
  Connection,
  ImportRequest,
  ImportResponse,
  Receipt,
} from "../schemas/ingestion";

// Dados de demonstração (NEXT_PUBLIC_USE_MOCKS=true). A senha nunca é guardada.
export const connectionsMock: Connection[] = [];

export function receiptMock(message: string): Receipt {
  return { id: crypto.randomUUID(), status: "received", message };
}

function mask(value: string) {
  return (value.length > 3 ? value.slice(0, 3) : value.slice(0, 1)) + "•••";
}

export function createConnectionMock(form: {
  name: string;
  host: string;
  database: string;
  table: string;
  control_column: string | null;
}): Connection {
  const connection: Connection = {
    id: crypto.randomUUID(),
    name: form.name,
    type: "postgres",
    masked_host: mask(form.host),
    masked_database: mask(form.database),
    table: form.table,
    control_column: form.control_column,
    status: "untested",
    last_error: null,
    last_synced_at: null,
    dataset: null,
    mode: null,
    compatibility: null,
  };
  connectionsMock.push(connection);
  return connection;
}

export function reportMock(): CompatibilityReport {
  return {
    compatible: true,
    checks: [
      {
        key: "connection",
        label: "Conexão",
        status: "ok",
        detail: "Conectou em modo somente leitura.",
      },
      {
        key: "columns",
        label: "Colunas obrigatórias",
        status: "ok",
        detail: "Todas as 10 colunas existem.",
      },
      {
        key: "types",
        label: "Tipos das colunas",
        status: "ok",
        detail: "Os tipos servem para o formato do SAML-D.",
      },
      {
        key: "sample",
        label: "Amostra validada",
        status: "ok",
        detail: "1000 linhas passaram nas regras da ingestão.",
      },
      {
        key: "ground_truth",
        label: "Gabarito (Is_laundering)",
        status: "info",
        detail: "A fonte tem gabarito: dá para medir e retreinar.",
      },
    ],
    missing_columns: [],
    wrong_types: [],
    has_ground_truth: true,
    has_typology: true,
    row_count: 48210,
    date_first: "2023-09-04",
    date_last: "2023-10-29",
    sample: { size: 1000, valid: true, errors: [] },
    overlap: {
      dataset: "saml-d",
      sample_accounts: 812,
      known_accounts_pct: 87.4,
      dates: "continue",
      dataset_first: "2022-10-07",
      dataset_last: "2023-08-23",
    },
    suggestion: {
      relation: "extend",
      message:
        "87,4% das contas da amostra já existem e as datas vêm logo depois dos dados atuais: parece continuar o conjunto atual.",
    },
  };
}

export async function deleteConnectionMock(id: string) {
  const index = connectionsMock.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Conexão não encontrada.");
  if (connectionsMock[index].status === "syncing")
    throw new Error("Há uma importação em andamento nesta conexão.");
  connectionsMock.splice(index, 1);
}

export async function testConnectionMock(id: string) {
  const connection = connectionsMock.find((item) => item.id === id);
  if (!connection) throw new Error("Conexão não encontrada.");
  const report = reportMock();
  connection.compatibility = report;
  connection.status = "connected";
  return report;
}

export async function startImportMock(
  id: string,
  request: ImportRequest,
): Promise<ImportResponse> {
  const connection = connectionsMock.find((item) => item.id === id);
  if (!connection) throw new Error("Conexão não encontrada.");
  const dataset =
    request.relation === "new_dataset" && request.new_dataset
      ? request.new_dataset.slug
      : "saml-d";
  connection.dataset = dataset;
  connection.mode = request.mode;
  connection.control_column = request.control_column;
  connection.status = "syncing";
  const job = createJobMock(request.mode === "follow" ? "process" : "import", {
    dataset,
    onDone: () => {
      connection.status = "connected";
      connection.last_synced_at = new Date().toISOString();
    },
  });
  return { dataset, job };
}
