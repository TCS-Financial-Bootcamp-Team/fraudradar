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

export const relationOptions: Array<{
  value: Relation;
  label: string;
  hint: string;
}> = [
  {
    value: "extend",
    label: "Continua os dados atuais",
    hint: "Mesmas contas, períodos seguintes. As transações entram no conjunto selecionado.",
  },
  {
    value: "new_dataset",
    label: "Outro dataset com a mesma estrutura",
    hint: "Cria um conjunto separado, com fila, períodos e histórico próprios.",
  },
];

export const modeOptions: Array<{
  value: ImportMode;
  label: string;
  hint: string;
}> = [
  {
    value: "history",
    label: "Analisar o histórico agora",
    hint: "Importa tudo o que já está na tabela e processa.",
  },
  {
    value: "follow",
    label: "Acompanhar só o que entrar",
    hint: "Ignora o que já existe; cada rodada lê as linhas novas pela coluna de controle.",
  },
  {
    value: "both",
    label: "Os dois",
    hint: "Importa o histórico e continua lendo as linhas novas.",
  },
];

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

export function reportChecks(report: CompatibilityReport) {
  return report.checks.map((check) => ({
    key: check.key,
    label: check.label,
    tone: check.status as Tone,
    detail: check.detail,
  }));
}

const datesText = {
  continue: "As datas continuam logo depois do fim dos dados atuais.",
  overlap: "As datas cruzam períodos do conjunto atual.",
  other_era: "As datas são de outra época.",
  empty_dataset: "O conjunto atual ainda não tem transações para comparar.",
  unknown: "Não foi possível comparar as datas.",
} as const;

export function overlapSummary(report: CompatibilityReport) {
  const overlap = report.overlap;
  if (!overlap) return null;
  const pct = overlap.known_accounts_pct;
  return {
    accounts:
      pct === null
        ? "Sem contas para comparar na amostra."
        : `${formatPercent(pct)} das ${overlap.sample_accounts} contas da amostra já existem no conjunto atual.`,
    dates: datesText[overlap.dates],
  };
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatRows(count: number | null) {
  return count === null
    ? "Não contado (a tabela é grande demais para contar agora)"
    : new Intl.NumberFormat("pt-BR").format(count);
}

export function dateRange(report: CompatibilityReport) {
  if (!report.date_first || !report.date_last) return "Sem datas lidas";
  const fmt = (iso: string) => iso.split("-").reverse().join("/");
  return `${fmt(report.date_first)} a ${fmt(report.date_last)}`;
}

export function groundTruthText(report: CompatibilityReport) {
  return report.has_ground_truth
    ? "Sim: dá para medir o modelo e, depois, retreinar."
    : "Não: o modelo dá as notas, mas não há como medir nem retreinar.";
}

export function canImport(report: CompatibilityReport | null) {
  return Boolean(report?.compatible);
}

export const statusLabels: Record<Connection["status"], string> = {
  untested: "Não testada",
  connected: "Conectada",
  incompatible: "Incompatível",
  error: "Com erro",
  syncing: "Importando",
};

// Ponto colorido + texto (DESIGN.md): só o erro usa o destaque.
export function statusTone(status: Connection["status"]): Tone {
  if (status === "connected") return "ok";
  if (status === "error" || status === "incompatible") return "fail";
  return "info";
}

export function modeLabel(mode: ImportMode | null) {
  return modeOptions.find((option) => option.value === mode)?.label ?? "";
}

// lib/api.ts só devolve o código HTTP; aqui ele vira uma explicação útil.
const statusHints: Record<string, string> = {
  "409":
    "A conexão já está em uso (importação em andamento ou já ligada a um conjunto), ou o slug já existe.",
  "422":
    "A API recusou os dados: confira se o host está liberado (EXTERNAL_DB_ALLOWED_HOSTS), o nome da tabela e da coluna, e se as datas não cruzam semanas já fechadas.",
  "503":
    "A API não tem a chave de cifra das conexões (CONNECTIONS_SECRET_KEY) configurada.",
};

export function explainApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = /\((\d{3})\)/.exec(message)?.[1];
  return (code && statusHints[code]) || message || "Não foi possível concluir.";
}
