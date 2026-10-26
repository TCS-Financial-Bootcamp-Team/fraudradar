import type {
  Alerta,
  Comunicacao,
  Detalhe,
  Filtros,
  Monitoramento,
} from "../schemas/alertas";

export const alertasMock: Alerta[] = Array.from({ length: 36 }, (_, i) => ({
  id: "ALT-" + String(2401 + i),
  conta: "CTA-" + String(810 + i),
  semana: i < 24 ? "2026-10-19" : "2026-10-12",
  pais: [
    "Brasil",
    "Portugal",
    "Reino Unido",
    "Estados Unidos",
    "Emirados Árabes",
  ][i % 5],
  tipologia: [
    "Fan-out",
    "Estruturação",
    "Ciclo financeiro",
    "Fan-in",
    "Dispersão internacional",
  ][i % 5],
  score: Math.max(22, 98 - i * 2),
  valor: 845000 - i * 15730,
  transacoes: 47 - i,
  status:
    i % 9 === 0
      ? "comunicar"
      : i % 7 === 0
        ? "arquivado"
        : i % 4 === 0
          ? "aprofundar"
          : "pendente",
}));
export const comunicacoesMock = new Map<string, Comunicacao>();
export const pareceresMock = new Map<string, Detalhe["parecer"]>();
export function filaMock(f: Filtros) {
  const itens = alertasMock
    .filter(
      (a) =>
        (!f.semana || a.semana === f.semana) &&
        (!f.status || a.status === f.status) &&
        (!f.pais || a.pais === f.pais),
    )
    .sort((a, b) => b.score - a.score);
  const inicio = ((f.pagina ?? 1) - 1) * 10;
  return {
    itens: itens.slice(inicio, inicio + 10),
    total: itens.length,
    paises: [...new Set(alertasMock.map((a) => a.pais))],
  };
}
export function detalheMock(id: string): Detalhe {
  const alerta = alertasMock.find((a) => a.id === id);
  if (!alerta) throw new Error("Alerta não encontrado.");
  return {
    ...alerta,
    contribuicoes: [
      { nome: "Dispersão de contrapartes", valor: 38 },
      { nome: "Velocidade de movimentação", valor: 29 },
      { nome: "Desvio do perfil histórico", valor: 21 },
      { nome: "Fluxo internacional", valor: 12 },
    ],
    regras: [
      {
        codigo: "R-014",
        descricao: "Múltiplos destinatários em uma janela de 24 horas.",
      },
      {
        codigo: "R-027",
        descricao: "Saídas sequenciais após recebimento de alto valor.",
      },
    ],
    movimentacoes: Array.from({ length: 8 }, (_, i) => ({
      id: "TRX-" + (901 + i),
      data: "2026-10-20T" + String(10 + i).padStart(2, "0") + ":30:00Z",
      origem: alerta.conta,
      destino: "CTA-" + (920 + i),
      valor: 12750 + i * 4100,
      moeda: "BRL",
      meio: ["Transferência", "Cartão", "Dinheiro"][i % 3],
    })),
    parecer: pareceresMock.get(id) ?? null,
  };
}
export function comunicacaoMock(id: string): Comunicacao {
  detalheMock(id);
  const existente = comunicacoesMock.get(id);
  return (
    existente ?? {
      alerta_id: id,
      status: "rascunho",
      atualizado_em: "2026-10-21T14:30:00Z",
      texto:
        "RELATO DE OPERAÇÃO ATÍPICA\n\nO monitoramento identificou dispersão de recursos para múltiplas contrapartes em curto intervalo, com movimentação incompatível com o histórico observado.\n\nEvidências: regra R-014 e transferências vinculadas ao alerta " +
        id +
        ".\n\nRecomendação: avaliar as evidências e complementar a diligência antes de qualquer comunicação oficial. Este documento é uma simulação acadêmica.",
    }
  );
}
export function monitoramentoMock(semana: string): Monitoramento {
  const itens = alertasMock.filter((a) => a.semana === semana);
  const distribuir = (campo: "tipologia" | "pais") =>
    [...new Set(itens.map((a) => a[campo]))]
      .map((nome) => ({
        nome,
        valor: itens.filter((a) => a[campo] === nome).length,
      }))
      .sort((a, b) => b.valor - a.valor);
  return {
    semana,
    indicadores: {
      alertas: itens.length,
      revisados: itens.filter((a) => a.status !== "pendente").length,
      comunicados: itens.filter(
        (a) =>
          a.status === "comunicar" &&
          comunicacoesMock.get(a.id)?.status === "aprovada",
      ).length,
      taxa_alerta: itens.length ? 0.024 : 0,
      valor_sinalizado: itens.reduce((s, a) => s + a.valor, 0),
      recall: itens.length ? 0.924 : 0,
      acerto_tipologia: itens.length ? 0.876 : 0,
    },
    semanas: [
      { nome: "14 set", valor: 12 },
      { nome: "21 set", valor: 17 },
      { nome: "28 set", valor: 14 },
      { nome: "05 out", valor: 21 },
      { nome: "12 out", valor: 12 },
      { nome: "19 out", valor: 24 },
    ],
    tipologias: distribuir("tipologia"),
    paises: distribuir("pais"),
    taxa_paises: ["Brasil", "Portugal", "Reino Unido", "Estados Unidos"].map(
      (nome, i) => ({ nome, valor: [0.024, 0.031, 0.018, 0.012][i] }),
    ),
    taxa_meios: [
      "Transferência",
      "Cartão",
      "Dinheiro",
      "Pagamento digital",
    ].map((nome, i) => ({ nome, valor: [0.032, 0.014, 0.048, 0.021][i] })),
  };
}
