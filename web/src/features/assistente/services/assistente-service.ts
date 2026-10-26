import { apiPost, USA_MOCKS } from "@/lib/api";
import { pseudonimizar } from "@/lib/formatacao";
import {
  pedidoChatSchema,
  respostaChatSchema,
  type PedidoChat,
} from "../schemas/assistente";
export async function conversar(dados: PedidoChat, signal?: AbortSignal) {
  const d = pedidoChatSchema.parse({
    ...dados,
    mensagem: pseudonimizar(dados.mensagem),
    historico: dados.historico
      .slice(-20)
      .map((m) => ({ ...m, texto: pseudonimizar(m.texto) })),
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
