import { apiPost, USA_MOCKS } from "@/lib/api";
import { pseudonimizar } from "@/lib/formatacao";
import {
  pedidoChatSchema,
  respostaChatSchema,
  LIMITE_TEXTO_HISTORICO,
  type PedidoChat,
} from "../schemas/assistente";
export async function conversar(
  dados: PedidoChat,
  signal?: AbortSignal,
  contas = new Map<string, string>(),
) {
  // O mesmo mapa cobre histórico e pergunta; a redação precede o corte para não vazar IDs parciais.
  const historico = dados.historico.slice(-20).map((m) => ({
    ...m,
    texto: pseudonimizar(m.texto, contas),
  }));
  const mensagem = pseudonimizar(dados.mensagem, contas);
  const d = pedidoChatSchema.parse({
    ...dados,
    mensagem,
    historico: historico.map((m) => ({
      ...m,
      texto: pseudonimizar(m.texto, contas).slice(0, LIMITE_TEXTO_HISTORICO),
    })),
  });
  const caminho = d.contexto.alerta_id
    ? "/alertas/" + encodeURIComponent(d.contexto.alerta_id) + "/chat"
    : "/chat";
  return respostaChatSchema.parse(
    USA_MOCKS
      ? (await import("./mocks")).respostaMock(d)
      : await apiPost(caminho, d, signal),
  );
}
