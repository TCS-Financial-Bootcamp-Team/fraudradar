import type { ChatRequest } from "../schemas/assistant";
export function chatResponseMock(request: ChatRequest) {
  return {
    answer: request.message.toLowerCase().includes("fan")
      ? "**Fan-out** é a dispersão de recursos de uma origem para várias contrapartes.\n\n- Observe a concentração das transferências no tempo.\n- Compare o volume com o perfil histórico.\n- Investigue os destinos e conexões de segundo nível.\n\nO padrão é um indício: uma decisão exige revisão humana."
      : "**Análise da semana**\n\nPriorize os alertas de maior score e revise as regras acionadas antes de registrar uma decisão. Use o detalhe do caso para consultar transações, conexões e fontes do parecer.\n\nEsta resposta é demonstrativa. Não conclui a ocorrência de lavagem de dinheiro.",
    sources: [
      {
        title: "Guia PLD · demonstração",
        excerpt:
          "Avalie o contexto e as evidências antes de concluir a análise.",
      },
    ],
  };
}
