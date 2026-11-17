import type { ChatRequest, ChatResponse } from "../schemas/assistant";

const GREETING_RE =
  /^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|e a[ií]|hello|hi|hey)(\s+(tudo bem|pessoal|assistente))?[!?.]*$/i;
const LEGAL_RE = /\b(lei|artigo|law)\b|art\.|9\.?613/i;
const DOMAIN_RE =
  /\b(fan[-\s]?out|fan[-\s]?in|alerta|alerts?|tipologia|typology|pld|aml|lavagem|laundering|smurf\w*|regra|rules?|score|semana|week|verificar|check|analis\w*|analy\w*|conta|account|transa[cç][aã]o|transaction|parecer|assessment|comunica\w*|report\w*|coaf|ciclo|cycle|gather|scatter)\b/i;

export function chatResponseMock(request: ChatRequest): ChatResponse {
  const normalized = request.message.trim().toLowerCase();

  if (GREETING_RE.test(normalized)) {
    return {
      kind: "small_talk",
      answer:
        "Olá! Posso ajudar com dúvidas sobre tipologias de PLD, regras da Lei nº 9.613/1998 e leitura dos alertas da fila.",
      sources: [],
    };
  }

  if (LEGAL_RE.test(normalized)) {
    return {
      kind: "legal",
      answer:
        "Conforme a **Lei nº 9.613/1998** [F1], operações com sérios indícios de lavagem de dinheiro exigem especial atenção e comunicação ao **COAF** no prazo legal, mantendo registro da análise.\n\nA decisão final sobre a comunicação cabe ao analista responsável.",
      sources: [
        {
          title: "Lei nº 9.613/1998, art. 11 [F1]",
          excerpt:
            "As pessoas referidas no art. 9º dispensarão especial atenção às operações que possam constituir-se em sérios indícios dos crimes previstos nesta Lei e deverão comunicá-las ao COAF no prazo de 24 horas.",
        },
      ],
    };
  }

  if (DOMAIN_RE.test(normalized)) {
    if (normalized.includes("fan")) {
      return {
        kind: "domain",
        answer:
          "**Fan-out** é a dispersão rápida de recursos de uma única conta de origem para várias contas destinatárias.\n\n- Observe a concentração temporal das transferências.\n- Compare o valor total com o perfil histórico da conta.\n- Verifique contrapartes novas e saltos de segundo nível.\n\nO padrão é um indício analítico; a conclusão exige revisão humana.",
        sources: [],
      };
    }

    if (request.context.alert_id || normalized.includes("alerta") || normalized.includes("alert")) {
      return {
        kind: "domain",
        answer:
          "Comece conferindo as **regras acionadas** e as **contribuições SHAP** para entender o que elevou a nota de risco, depois valide as movimentações da janela semanal e as contrapartes no grafo.\n\nEsta resposta é demonstrativa e não substitui a revisão do caso.",
        sources: [],
      };
    }

    return {
      kind: "domain",
      answer:
        "**Análise da semana**\n\nPriorize os alertas de maior nota de risco e revise as regras acionadas antes de registrar uma decisão. Use o detalhe do caso para consultar movimentações, conexões e o parecer.\n\nEsta resposta é demonstrativa e não conclui a ocorrência de lavagem de dinheiro.",
      sources: [],
    };
  }

  return {
    kind: "out_of_scope",
    answer:
      "Posso responder apenas sobre prevenção à lavagem de dinheiro (PLD), tipologias, Lei nº 9.613/1998 e os alertas do FraudRadar.",
    sources: [],
  };
}
