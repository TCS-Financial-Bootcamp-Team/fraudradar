import type { PedidoChat } from "../schemas/assistente";
export function respostaMock(d: PedidoChat) {
  return {
    resposta: d.mensagem.toLowerCase().includes("fan")
      ? "**Fan-out** é a dispersão de recursos de uma origem para várias contrapartes.\n\n- Observe a concentração das transferências no tempo.\n- Compare o volume com o perfil histórico.\n- Investigue os destinos e conexões de segundo nível.\n\nO padrão é um indício: uma decisão exige revisão humana."
      : "**Análise da semana**\n\nPriorize os alertas de maior score e revise as regras acionadas antes de registrar uma decisão. Use o detalhe do caso para consultar transações, conexões e fontes do parecer.\n\nEsta resposta é demonstrativa. Não conclui a ocorrência de lavagem de dinheiro.",
    fontes: [
      {
        titulo: "Guia PLD · demonstração",
        trecho:
          "Avalie o contexto e as evidências antes de concluir a análise.",
      },
    ],
  };
}
