import assert from "node:assert/strict";
import { test } from "node:test";
import {
  transactionSchema,
  connectionSchema,
  dataSourceSchema,
  csvHeaders,
} from "../src/features/ingestion/schemas/ingestion";
import {
  validateCsvHeaders,
  prepareCsvPreview,
} from "../src/features/ingestion/services/ingestion-service";
import {
  signupSchema,
  passwordUpdateSchema,
} from "../src/features/auth/schemas/auth";
import {
  decisionSchema,
  approvalSchema,
  monitoringSchema,
} from "../src/features/alerts/schemas/alerts";
import { pseudonymize } from "../src/lib/format";

test("prévia de CSV lê somente uma amostra e interrompe o arquivo grande", async () => {
  let bytesRead = 0;
  class TestFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    readAsText(blob: Blob) {
      bytesRead += blob.size;
      void blob
        .text()
        .then((result) => this.onload?.({ target: { result } }))
        .catch((error: unknown) => this.onerror?.(error));
    }
  }
  const previousDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "FileReader",
  );
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: TestFileReader,
  });
  try {
    const csvRow =
      "12:30:45,2026-10-20,12345678,87654321,1500,BRL,USD,Brazil,USA,Wire\n";
    const csvFile = new File(
      [csvHeaders.join(",") + "\n", csvRow.repeat(100000)],
      "operacoes.csv",
    );
    const preview = await prepareCsvPreview(csvFile);
    assert.equal(preview.rows.length, 20);
    assert.ok(
      bytesRead <= 64 * 1024,
      "A prévia não deve ler o arquivo inteiro.",
    );
    assert.ok(csvFile.size > bytesRead * 10);
  } finally {
    if (previousDescriptor)
      Object.defineProperty(globalThis, "FileReader", previousDescriptor);
    else Reflect.deleteProperty(globalThis, "FileReader");
  }
});

const sampleTransaction = {
  Time: "12:30:45",
  Date: "2026-10-20",
  Sender_account: "12345678",
  Receiver_account: "87654321",
  Amount: 1500,
  Payment_currency: "BRL",
  Received_currency: "USD",
  Sender_bank_location: "Brazil",
  Receiver_bank_location: "USA",
  Payment_type: "Wire",
};

test("ingestão aceita uma operação e rejeita dados de avaliação, datas e valores inválidos", () => {
  assert.ok(transactionSchema.safeParse(sampleTransaction).success);
  for (const override of [
    { Is_laundering: 1 },
    { Laundering_type: "fan-out" },
    { Amount: 0 },
    { Amount: Number.POSITIVE_INFINITY },
    { Date: "2026-02-30" },
    { Time: "25:00:00" },
  ]) {
    assert.equal(
      transactionSchema.safeParse({ ...sampleTransaction, ...override })
        .success,
      false,
    );
  }
});

test("CSV exige exatamente as colunas transacionais, sem rótulos ou duplicatas", () => {
  assert.doesNotThrow(() => validateCsvHeaders(csvHeaders));
  assert.throws(() => validateCsvHeaders([...csvHeaders, "Is_laundering"]));
  assert.throws(() => validateCsvHeaders([...csvHeaders, "Laundering_type"]));
  assert.throws(() =>
    validateCsvHeaders([...csvHeaders.slice(1), csvHeaders[1]]),
  );
});

test("cadastro e recuperação exigem confirmação e senha com força mínima", () => {
  const signupData = {
    name: "Analista de teste",
    email: "analista@example.test",
    password: "fraseSegura123",
    confirmation: "fraseSegura123",
  };
  assert.ok(signupSchema.safeParse(signupData).success);
  assert.equal(
    signupSchema.safeParse({ ...signupData, confirmation: "diferente" })
      .success,
    false,
  );
  assert.equal(
    passwordUpdateSchema.safeParse({
      password: "12345678",
      confirmation: "12345678",
    }).success,
    false,
  );
});

test("encaminhamentos exigem justificativa e aprovação exige um relato revisável", () => {
  assert.equal(
    decisionSchema.safeParse({ decision: "report", justification: " " })
      .success,
    false,
  );
  assert.ok(
    decisionSchema.safeParse({
      decision: "archive",
      justification: "O padrão foi esclarecido após revisão das evidências.",
    }).success,
  );
  assert.equal(approvalSchema.safeParse({ content: "curto" }).success, false);
});

test("credenciais só entram no pedido de conexão; resposta pública contém apenas máscara", () => {
  assert.ok(
    connectionSchema.safeParse({
      name: "Teste",
      type: "postgres",
      connection_string:
        "postgresql://leitura:segredo@db.example.test:5432/operacoes",
      ssl: true,
    }).success,
  );
  assert.equal(
    connectionSchema.safeParse({
      name: "Teste",
      type: "postgres",
      connection_string: "https://db.example.test",
      ssl: true,
    }).success,
    false,
  );
  const source = dataSourceSchema.parse({
    id: "1",
    name: "Teste",
    type: "postgres",
    masked_host: "db•••",
    masked_database: "op•••",
    status: "connected",
    last_synced_at: null,
    connection_string: "segredo",
    password: "segredo",
  });
  assert.equal("password" in source, false);
  assert.equal("connection_string" in source, false);
});

test("mensagens livres ocultam contas com aliases distintos e preservam os dados da análise", () => {
  const sanitized = pseudonymize(
    "Contas 123, 123456789 e BR123456789; origem AB12. Conta 123-4. Analise R-014, 10.000, 24 horas e 2026-10-19. Repito conta 123.",
  );
  assert.doesNotMatch(sanitized, /123|BR123456789|AB12/);
  for (const token of ["R-014", "10.000", "24 horas", "2026-10-19"])
    assert.ok(sanitized.includes(token), token);
  assert.equal(new Set(sanitized.match(/\[conta \d+\]/g)).size, 5);
  assert.equal(sanitized.match(/\[conta 1\]/g)?.length, 2);
  assert.equal(
    pseudonymize(sanitized),
    sanitized,
    "Aliases não podem ser pseudonimizados novamente.",
  );
});

test("aliases persistem na conversa e também ocultam referências repetidas sem rótulo", () => {
  const accounts = new Map<string, string>();
  assert.equal(pseudonymize("Conta 123-4", accounts), "Conta [conta 1]");
  assert.equal(
    pseudonymize("Compare 123-4 com conta AB12", accounts),
    "Compare [conta 1] com conta [conta 2]",
  );
  assert.equal(
    pseudonymize('Sender_account: "87654321" e CTA-811', accounts),
    'Sender_account: "[conta 3]" e [conta 4]',
  );
  assert.equal(
    pseudonymize("R-014: 10.000 em 24 horas, 2026-10-19"),
    "R-014: 10.000 em 24 horas, 2026-10-19",
  );
});

test("números de contas não apagam valores e durações iguais aos identificadores", () => {
  assert.equal(
    pseudonymize(
      "Contas 24, 10.000, 24 horas e 2026-10-19. Compare conta 123 e R-014; R$ 123 e 123 reais.",
    ),
    "Contas [conta 1], 10.000, 24 horas e 2026-10-19. Compare conta [conta 2] e R-014; R$ 123 e 123 reais.",
  );
});

test("monitoringSchema valida novos campos aditivos e aceita recall/acurácia nulos", () => {
  const payload = {
    week: "2026-10-19",
    indicators: {
      alerts: 10,
      reviewed: 5,
      reported: 2,
      alert_rate: 0.05,
      flagged_amount: 150000,
      recall: null,
      typology_accuracy: null,
    },
    weeks: [{ name: "19 out", value: 10 }],
    typologies: [{ name: "Fan-out", value: 10 }],
    countries: [{ name: "Brasil", value: 10 }],
    country_rates: [{ name: "Brasil", value: 0.05 }],
    payment_type_rates: [{ name: "Transferência", value: 0.05 }],
    recall_series: [{ name: "19 out", value: 0.92 }],
    score_histogram: [
      { name: "40", value: 1 },
      { name: "50", value: 2 },
      { name: "60", value: 1 },
      { name: "70", value: 1 },
      { name: "80", value: 2 },
      { name: "90", value: 1 },
      { name: "95", value: 1 },
      { name: "100", value: 1 },
    ],
    status_counts: {
      pending: 5,
      escalated: 2,
      archived: 1,
      reported: 2,
    },
  };
  const parsed = monitoringSchema.parse(payload);
  assert.equal(parsed.indicators.recall, null);
  assert.equal(parsed.indicators.typology_accuracy, null);
  assert.equal(parsed.score_histogram.length, 8);
  assert.equal(parsed.status_counts.pending, 5);
  assert.equal(parsed.recall_series[0].value, 0.92);
});
