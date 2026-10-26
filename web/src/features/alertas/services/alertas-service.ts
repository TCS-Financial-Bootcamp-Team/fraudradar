import { apiGet, apiPost, USA_MOCKS } from "@/lib/api";
import {
  alertaSchema,
  aprovacaoSchema,
  comunicacaoSchema,
  decisaoSchema,
  detalheSchema,
  filaSchema,
  grafoSchema,
  monitoramentoSchema,
  parecerSchema,
  replaySchema,
  type Decisao,
  type Filtros,
} from "../schemas/alertas";

export async function buscarAlertas(filtros: Filtros, signal?: AbortSignal) {
  if (USA_MOCKS)
    return filaSchema.parse((await import("./mocks")).filaMock(filtros));
  const busca = new URLSearchParams({
    semana: filtros.semana,
    pagina: String(filtros.pagina ?? 1),
    tamanho: "10",
    ordenar: "score_desc",
  });
  if (filtros.status) busca.set("status", filtros.status);
  if (filtros.pais) busca.set("pais", filtros.pais);
  return filaSchema.parse(await apiGet("/alertas?" + busca, { signal }));
}
export async function buscarDetalhe(id: string, signal?: AbortSignal) {
  return detalheSchema.parse(
    USA_MOCKS
      ? (await import("./mocks")).detalheMock(id)
      : await apiGet("/alertas/" + encodeURIComponent(id), { signal }),
  );
}
export async function buscarGrafo(id: string, signal?: AbortSignal) {
  if (USA_MOCKS) {
    const d = (await import("./mocks")).detalheMock(id);
    return grafoSchema.parse({
      nos: [
        { id: d.conta, rotulo: d.conta, central: true },
        ...d.movimentacoes.map((m) => ({
          id: m.destino,
          rotulo: m.destino,
          central: false,
        })),
        { id: "CTA-1001", rotulo: "CTA-1001", central: false },
      ],
      arestas: [
        ...d.movimentacoes.map((m) => ({
          id: m.id,
          origem: d.conta,
          destino: m.destino,
          valor: m.valor,
        })),
        {
          id: "TRX-2H",
          origem: d.movimentacoes[0].destino,
          destino: "CTA-1001",
          valor: 3200,
        },
      ],
    });
  }
  return grafoSchema.parse(
    await apiGet("/alertas/" + encodeURIComponent(id) + "/grafo", { signal }),
  );
}
export async function gerarParecer(id: string) {
  if (USA_MOCKS) {
    const m = await import("./mocks");
    m.detalheMock(id);
    const parecer = parecerSchema.parse({
      texto:
        "O padrão observado é compatível com dispersão de recursos (fan-out). A concentração temporal das saídas e o aumento de contrapartes justificam diligência adicional [1]. A análise constitui um indício e precisa de revisão humana [2].",
      fontes: [
        {
          titulo: "[1] Evidência transacional · R-014",
          trecho:
            "Transferências sequenciais a múltiplas contrapartes na janela analisada.",
        },
        {
          titulo: "[2] Guia de análise PLD · base demonstrativa",
          trecho:
            "Indícios estatísticos não constituem confirmação de ilícito.",
        },
      ],
    });
    m.pareceresMock.set(id, parecer);
    return parecer;
  }
  return parecerSchema.parse(
    await apiPost("/alertas/" + encodeURIComponent(id) + "/parecer", {}),
  );
}
export async function registrarDecisao(id: string, dados: Decisao) {
  const d = decisaoSchema.parse(dados);
  if (USA_MOCKS) {
    const m = await import("./mocks");
    const alerta = m.alertasMock.find((a) => a.id === id);
    if (!alerta) throw new Error("Alerta não encontrado.");
    alerta.status = d.decisao === "arquivar" ? "arquivado" : d.decisao;
    return alertaSchema.parse(alerta);
  }
  return alertaSchema.parse(
    await apiPost("/alertas/" + encodeURIComponent(id) + "/decisao", d),
  );
}
export async function buscarComunicacao(id: string, signal?: AbortSignal) {
  return comunicacaoSchema.parse(
    USA_MOCKS
      ? (await import("./mocks")).comunicacaoMock(id)
      : await apiGet("/alertas/" + encodeURIComponent(id) + "/comunicacao", {
          signal,
        }),
  );
}
export async function listarComunicacoes(semana: string, signal?: AbortSignal) {
  // A API planejada não tem endpoint de coleção: percorremos a fila paginada.
  const primeira = await buscarAlertas({ semana, status: "comunicar" }, signal);
  const itens = [...primeira.itens];
  for (let pagina = 2; itens.length < primeira.total; pagina++) {
    const lote = await buscarAlertas(
      { semana, status: "comunicar", pagina },
      signal,
    );
    if (!lote.itens.length) break;
    itens.push(...lote.itens);
  }
  return Promise.all(itens.map((a) => buscarComunicacao(a.id, signal)));
}
export async function aprovarComunicacao(id: string, texto: string) {
  const d = aprovacaoSchema.parse({ texto });
  if (USA_MOCKS) {
    const m = await import("./mocks");
    const comunicacao = {
      ...m.comunicacaoMock(id),
      texto: d.texto,
      status: "aprovada" as const,
      atualizado_em: new Date().toISOString(),
    };
    m.comunicacoesMock.set(id, comunicacao);
    return comunicacaoSchema.parse(comunicacao);
  }
  return comunicacaoSchema.parse(
    await apiPost(
      "/alertas/" + encodeURIComponent(id) + "/comunicacao/aprovar",
      d,
    ),
  );
}
export async function buscarMonitoramento(
  semana: string,
  signal?: AbortSignal,
) {
  return monitoramentoSchema.parse(
    USA_MOCKS
      ? (await import("./mocks")).monitoramentoMock(semana)
      : await apiGet("/monitoramento?semana=" + encodeURIComponent(semana), {
          signal,
        }),
  );
}
export async function proximaSemana(semana: string) {
  if (USA_MOCKS) {
    const m = await import("./mocks");
    const data = new Date(semana + "T00:00:00Z");
    data.setUTCDate(data.getUTCDate() + 7);
    const nova = data.toISOString().slice(0, 10);
    if (!m.alertasMock.some((a) => a.semana === nova))
      m.alertasMock.push(
        ...m.alertasMock
          .slice(0, 12)
          .map((a, i) => ({
            ...a,
            id: "ALT-" + nova + "-" + i,
            semana: nova,
            status: "pendente" as const,
          })),
      );
    return replaySchema.parse({ semana: nova, alertas_gerados: 12 });
  }
  return replaySchema.parse(await apiPost("/replay/proxima-semana", {}));
}
