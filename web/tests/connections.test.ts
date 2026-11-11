import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compatibilityReportSchema,
  importRequestSchema,
} from "../src/features/ingestion/schemas/ingestion";
import {
  buildImportRequest,
  canImport,
  dateRange,
  explainApiError,
  groundTruthText,
  overlapSummary,
  reportChecks,
  slugFromName,
  statusTone,
} from "../src/features/ingestion/services/connection-model";
import { reportMock } from "../src/features/ingestion/services/mocks";

const answers = {
  relation: "extend" as const,
  datasetName: "",
  datasetSlug: "",
  mode: "history" as const,
  controlColumn: " id ",
};

test("slug sugerido: sem acento, minúsculo, hífen e até 40 caracteres", () => {
  assert.equal(
    slugFromName("Banco do Parceiro Ltda."),
    "banco-do-parceiro-ltda",
  );
  assert.equal(slugFromName("  Ação & Reação  "), "acao-reacao");
  assert.equal(slugFromName("x".repeat(60)).length, 40);
  assert.equal(slugFromName("---"), "");
});

test("respostas às duas perguntas viram o pedido de importação", () => {
  assert.deepEqual(buildImportRequest(answers), {
    relation: "extend",
    mode: "history",
    control_column: "id",
  });
  const newDataset = buildImportRequest({
    ...answers,
    relation: "new_dataset",
    mode: "both",
    datasetName: "Banco do parceiro",
    datasetSlug: "banco-do-parceiro",
  });
  assert.deepEqual(newDataset.new_dataset, {
    name: "Banco do parceiro",
    slug: "banco-do-parceiro",
  });
  assert.equal(newDataset.mode, "both");
});

test("importação recusa slug inválido, conjunto novo sem nome e coluna de controle com SQL", () => {
  assert.throws(() =>
    buildImportRequest({
      ...answers,
      relation: "new_dataset",
      datasetName: "Ok",
      datasetSlug: "Slug Inválido",
    }),
  );
  assert.throws(() =>
    buildImportRequest({ ...answers, relation: "new_dataset" }),
  );
  assert.throws(() =>
    buildImportRequest({ ...answers, controlColumn: "id; DROP TABLE x" }),
  );
  assert.equal(
    importRequestSchema.safeParse({
      relation: "extend",
      new_dataset: { name: "x", slug: "x" },
      mode: "history",
      control_column: "id",
    }).success,
    false,
  );
});

test("relatório: itens com passou/falhou, gabarito, sobreposição e sugestão", () => {
  const report = compatibilityReportSchema.parse(reportMock());
  const checks = reportChecks(report);
  assert.deepEqual(
    checks.map((check) => [check.key, check.tone]),
    [
      ["connection", "ok"],
      ["columns", "ok"],
      ["types", "ok"],
      ["sample", "ok"],
      ["ground_truth", "info"],
    ],
  );
  assert.match(groundTruthText(report), /^Sim/);
  assert.equal(dateRange(report), "04/09/2023 a 29/10/2023");
  const overlap = overlapSummary(report);
  assert.match(overlap?.accounts ?? "", /87,4% das 812 contas/);
  assert.match(overlap?.dates ?? "", /continuam/);
  assert.equal(report.suggestion?.relation, "extend");
  assert.equal(canImport(report), true);
});

test("relatório incompatível não libera a importação e sem gabarito avisa", () => {
  const report = compatibilityReportSchema.parse({
    ...reportMock(),
    compatible: false,
    has_ground_truth: false,
    missing_columns: ["Payment_type"],
    overlap: null,
    date_first: null,
    date_last: null,
    checks: [
      {
        key: "columns",
        label: "Colunas obrigatórias",
        status: "fail",
        detail: "Faltam: Payment_type.",
      },
    ],
  });
  assert.equal(canImport(report), false);
  assert.equal(canImport(null), false);
  assert.equal(reportChecks(report)[0].tone, "fail");
  assert.match(groundTruthText(report), /^Não/);
  assert.equal(overlapSummary(report), null);
  assert.equal(dateRange(report), "Sem datas lidas");
});

test("status da conexão: só erro e incompatível usam o destaque", () => {
  assert.equal(statusTone("connected"), "ok");
  assert.equal(statusTone("error"), "fail");
  assert.equal(statusTone("incompatible"), "fail");
  assert.equal(statusTone("syncing"), "info");
  assert.equal(statusTone("untested"), "info");
});

test("erros da API viram explicação útil sem expor detalhes", () => {
  assert.match(
    explainApiError(
      new Error(
        "Não foi possível concluir a solicitação (422). Tente novamente.",
      ),
    ),
    /EXTERNAL_DB_ALLOWED_HOSTS/,
  );
  assert.match(
    explainApiError(
      new Error(
        "Não foi possível concluir a solicitação (503). Tente novamente.",
      ),
    ),
    /CONNECTIONS_SECRET_KEY/,
  );
  assert.equal(
    explainApiError(new Error("Sua sessão expirou. Entre novamente.")),
    "Sua sessão expirou. Entre novamente.",
  );
  assert.match(explainApiError("x"), /Não foi possível/);
});
