import assert from "node:assert/strict";
import { test } from "node:test";
import {
  transacaoSchema,
  conexaoSchema,
  fonteSchema,
  cabecalhosCsv,
} from "../src/features/ingestao/schemas/ingestao";
import { validarCabecalhos } from "../src/features/ingestao/services/ingestao-service";
import { prepararPrevia } from "../src/features/ingestao/services/ingestao-service";
import {
  cadastroSchema,
  redefinirSchema,
} from "../src/features/autenticacao/schemas/autenticacao";
import {
  decisaoSchema,
  aprovacaoSchema,
} from "../src/features/alertas/schemas/alertas";
import { pseudonimizar } from "../src/lib/formatacao";

test("prévia de CSV lê somente uma amostra e interrompe o arquivo grande", async () => {
  let bytesLidos = 0;
  class LeitorDeTeste {
    onload: ((evento: { target: { result: string } }) => void) | null = null;
    onerror: ((erro: unknown) => void) | null = null;
    readAsText(blob: Blob) {
      bytesLidos += blob.size;
      void blob
        .text()
        .then((texto) => this.onload?.({ target: { result: texto } }))
        .catch((erro: unknown) => this.onerror?.(erro));
    }
  }
  const anterior = Object.getOwnPropertyDescriptor(globalThis, "FileReader");
  Object.defineProperty(globalThis, "FileReader", {
    configurable: true,
    value: LeitorDeTeste,
  });
  try {
    const linha =
      "12:30:45,2026-10-20,12345678,87654321,1500,BRL,USD,Brazil,USA,Wire\n";
    const arquivo = new File(
      [cabecalhosCsv.join(",") + "\n", linha.repeat(100000)],
      "operacoes.csv",
    );
    const previa = await prepararPrevia(arquivo);
    assert.equal(previa.linhas.length, 20);
    assert.ok(
      bytesLidos <= 64 * 1024,
      "A prévia não deve ler o arquivo inteiro.",
    );
    assert.ok(arquivo.size > bytesLidos * 10);
  } finally {
    if (anterior) Object.defineProperty(globalThis, "FileReader", anterior);
    else Reflect.deleteProperty(globalThis, "FileReader");
  }
});

const transacao = {
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
  assert.ok(transacaoSchema.safeParse(transacao).success);
  for (const alteracao of [
    { Is_laundering: 1 },
    { Laundering_type: "fan-out" },
    { Amount: 0 },
    { Amount: Number.POSITIVE_INFINITY },
    { Date: "2026-02-30" },
    { Time: "25:00:00" },
  ]) {
    assert.equal(
      transacaoSchema.safeParse({ ...transacao, ...alteracao }).success,
      false,
    );
  }
});

test("CSV exige exatamente as colunas transacionais, sem rótulos ou duplicatas", () => {
  assert.doesNotThrow(() => validarCabecalhos(cabecalhosCsv));
  assert.throws(() => validarCabecalhos([...cabecalhosCsv, "Is_laundering"]));
  assert.throws(() => validarCabecalhos([...cabecalhosCsv, "Laundering_type"]));
  assert.throws(() =>
    validarCabecalhos([...cabecalhosCsv.slice(1), cabecalhosCsv[1]]),
  );
});

test("cadastro e recuperação exigem confirmação e senha com força mínima", () => {
  const dados = {
    nome: "Analista de teste",
    email: "analista@example.test",
    senha: "fraseSegura123",
    confirmacao: "fraseSegura123",
  };
  assert.ok(cadastroSchema.safeParse(dados).success);
  assert.equal(
    cadastroSchema.safeParse({ ...dados, confirmacao: "diferente" }).success,
    false,
  );
  assert.equal(
    redefinirSchema.safeParse({ senha: "12345678", confirmacao: "12345678" })
      .success,
    false,
  );
});

test("encaminhamentos exigem justificativa e aprovação exige um relato revisável", () => {
  assert.equal(
    decisaoSchema.safeParse({ decisao: "comunicar", justificativa: " " })
      .success,
    false,
  );
  assert.ok(
    decisaoSchema.safeParse({
      decisao: "arquivar",
      justificativa: "O padrão foi esclarecido após revisão das evidências.",
    }).success,
  );
  assert.equal(aprovacaoSchema.safeParse({ texto: "curto" }).success, false);
});

test("credenciais só entram no pedido de conexão; resposta pública contém apenas máscara", () => {
  assert.ok(
    conexaoSchema.safeParse({
      nome: "Teste",
      tipo: "postgres",
      connection_string:
        "postgresql://leitura:segredo@db.example.test:5432/operacoes",
      ssl: true,
    }).success,
  );
  assert.equal(
    conexaoSchema.safeParse({
      nome: "Teste",
      tipo: "postgres",
      connection_string: "https://db.example.test",
      ssl: true,
    }).success,
    false,
  );
  const fonte = fonteSchema.parse({
    id: "1",
    nome: "Teste",
    tipo: "postgres",
    host_mascarado: "db•••",
    banco_mascarado: "op•••",
    status: "conectada",
    ultima_sincronizacao: null,
    connection_string: "segredo",
    senha: "segredo",
  });
  assert.equal("senha" in fonte, false);
  assert.equal("connection_string" in fonte, false);
});

test("mensagens livres ocultam contas com aliases distintos e preservam os dados da análise", () => {
  const texto = pseudonimizar(
    "Contas 123, 123456789 e BR123456789; origem AB12. Conta 123-4. Analise R-014, 10.000, 24 horas e 2026-10-19. Repito conta 123.",
  );
  assert.doesNotMatch(texto, /123|BR123456789|AB12/);
  for (const dado of ["R-014", "10.000", "24 horas", "2026-10-19"])
    assert.ok(texto.includes(dado), dado);
  assert.equal(new Set(texto.match(/\[conta \d+\]/g)).size, 5);
  assert.equal(texto.match(/\[conta 1\]/g)?.length, 2);
  assert.equal(
    pseudonimizar(texto),
    texto,
    "Aliases não podem ser pseudonimizados novamente.",
  );
});

test("aliases persistem na conversa e também ocultam referências repetidas sem rótulo", () => {
  const contas = new Map<string, string>();
  assert.equal(pseudonimizar("Conta 123-4", contas), "Conta [conta 1]");
  assert.equal(
    pseudonimizar("Compare 123-4 com conta AB12", contas),
    "Compare [conta 1] com conta [conta 2]",
  );
  assert.equal(
    pseudonimizar('Sender_account: "87654321" e CTA-811', contas),
    'Sender_account: "[conta 3]" e [conta 4]',
  );
  assert.equal(
    pseudonimizar("R-014: 10.000 em 24 horas, 2026-10-19"),
    "R-014: 10.000 em 24 horas, 2026-10-19",
  );
});

test("números de contas não apagam valores e durações iguais aos identificadores", () => {
  assert.equal(
    pseudonimizar(
      "Contas 24, 10.000, 24 horas e 2026-10-19. Compare conta 123 e R-014; R$ 123 e 123 reais.",
    ),
    "Contas [conta 1], 10.000, 24 horas e 2026-10-19. Compare conta [conta 2] e R-014; R$ 123 e 123 reais.",
  );
});
