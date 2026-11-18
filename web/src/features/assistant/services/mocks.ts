import { getT } from "@/i18n/runtime";
import { ApiError } from "@/lib/api";
import type {
  AiModelsResponse,
  ChatLink,
  ChatRequest,
  ChatResponse,
  ConversationDetail,
  ConversationSummary,
} from "../schemas/assistant";

const GREETING_RE =
  /^(oi|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|e a[ií]|hello|hi|hey)(\s+(tudo bem|pessoal|assistente))?[!?.]*$/i;
const LEGAL_RE = /\b(lei|artigo|law)\b|art\.|9\.?613/i;
const DECISION_RE =
  /\b(lavagem de verdade|parece lavagem|(?:isso|isto)\s+[eé]\s+lavagem|pesa contra|falta verificar|antes de decidir|devo (arquivar|aprofundar|comunicar)|arquivar ou comunicar|real money laundering|look like.*laundering|weighs against|missing before deciding|should i (archive|escalate|report))\b/i;
const SYSTEM_IMPORT_RE =
  /\b(import\w*|csv|carreg\w*|ingest\w*|fontes de dados|data sources)\b|onde.*transa[cç]|where.*import/i;
const SYSTEM_PAGE_RE =
  /\b(nota mais alta|highest score|resuma.*p[aá]gina|resuma.*alertas|summarize.*page|summarize.*alerts|desta p[aá]gina|this page|vis[ií]veis|visible)\b/i;
const SYSTEM_NAV_RE =
  /\b(onde fica|como abrir|como acessar|n[aã]o encontro|where is|how do i find|dashboard|vis[aã]o geral|monitoramento|monitoring|configura[cç][õo]es|settings|contas suspeitas|suspicious accounts)\b/i;
const DOMAIN_RE =
  /\b(fan[-\s]?out|fan[-\s]?in|alerta|alerts?|tipologia|typology|pld|aml|lavagem|laundering|smurf\w*|regra|rules?|score|semana|week|verificar|check|analis\w*|analy\w*|conta|account|transa[cç][aã]o|transaction|parecer|assessment|comunica\w*|report\w*|coaf|ciclo|cycle|gather|scatter)\b/i;

const DEFAULT_MODEL_ID = "gemini-2.5-flash";

const MODELS_MOCK: AiModelsResponse = {
  default: DEFAULT_MODEL_ID,
  models: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

function initialMockConversations(): ConversationDetail[] {
  const now = Date.now();
  return [
    {
      id: 101,
      title: "O que é a tipologia fan-out?",
      updated_at: new Date(now - 2 * 3600 * 1000).toISOString(),
      messages: [
        {
          role: "user",
          content: "O que é a tipologia fan-out?",
          sources: [],
          links: [],
        },
        {
          role: "assistant",
          content:
            "**Fan-out** é a dispersão rápida de recursos de uma única conta de origem para várias contas destinatárias.\n\n- Observe a concentração temporal das transferências.\n- Compare o valor total com o perfil histórico da conta.",
          kind: "domain",
          sources: [],
          links: [],
          model: DEFAULT_MODEL_ID,
          created_at: new Date(now - 2 * 3600 * 1000).toISOString(),
        },
      ],
    },
    {
      id: 102,
      title: "Onde eu importo transações?",
      updated_at: new Date(now - 26 * 3600 * 1000).toISOString(),
      messages: [
        {
          role: "user",
          content: "Onde eu importo transações?",
          sources: [],
          links: [],
        },
        {
          role: "assistant",
          content:
            "Você pode importar transações na tela **Fontes de dados**: envio de arquivo CSV, lançamento avulso ou conexão com banco externo PostgreSQL.",
          kind: "system",
          sources: [],
          links: [{ href: "/ingestion", label: "Abrir Fontes de dados" }],
          model: DEFAULT_MODEL_ID,
          created_at: new Date(now - 26 * 3600 * 1000).toISOString(),
        },
      ],
    },
  ];
}

const conversationsStore = new Map<number, ConversationDetail>(
  initialMockConversations().map((item) => [item.id, item]),
);
let nextConversationId = 103;

export function aiModelsMock(): AiModelsResponse {
  return {
    default: MODELS_MOCK.default,
    models: MODELS_MOCK.models.map((item) => ({ ...item })),
  };
}

export function listConversationsMock(limit = 30): ConversationSummary[] {
  return [...conversationsStore.values()]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, limit)
    .map((conv) => ({
      id: conv.id,
      title: conv.title,
      updated_at: conv.updated_at,
      message_count: conv.messages.length,
    }));
}

export function fetchConversationMock(id: number): ConversationDetail {
  const found = conversationsStore.get(id);
  if (!found) {
    throw new ApiError(
      getT("errors.api")("chat_conversation_not_found"),
      404,
      "chat.conversation_not_found",
    );
  }
  return {
    ...found,
    messages: found.messages.map((m) => ({
      ...m,
      sources: [...m.sources],
      links: [...m.links],
    })),
  };
}

export function deleteConversationMock(id: number): void {
  if (!conversationsStore.has(id)) {
    throw new ApiError(
      getT("errors.api")("chat_conversation_not_found"),
      404,
      "chat.conversation_not_found",
    );
  }
  conversationsStore.delete(id);
}

function buildSystemMockAnswer(
  request: ChatRequest,
  usedModel: string,
): Omit<ChatResponse, "conversation_id"> {
  const normalized = request.message.trim().toLowerCase();

  if (SYSTEM_IMPORT_RE.test(normalized)) {
    return {
      kind: "system",
      answer:
        "Para importar transações, acesse **Fontes de dados** no menu lateral (seção Dados). Lá você encontra o envio de arquivo **CSV** no formato SAML-D, o registro de transação avulsa e conexões externas em PostgreSQL.",
      sources: [],
      links: [{ href: "/ingestion", label: "Abrir Fontes de dados" }],
      model: usedModel,
    };
  }

  if (SYSTEM_PAGE_RE.test(normalized)) {
    const pageState = request.context.page_state;
    const filterEntries = Object.entries(pageState?.filters ?? {});
    const filtersSummary =
      filterEntries.length > 0
        ? filterEntries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")
        : "nenhum filtro adicional";
    const totalInfo =
      typeof pageState?.total === "number"
        ? ` Total filtrado: **${pageState.total}** alertas (página ${pageState.page ?? 1}).`
        : "";
    const idsCount = pageState?.visible_alert_ids.length ?? 0;
    const idsInfo =
      idsCount > 0
        ? ` Alertas numéricos compartilhados desta página: ${idsCount}.`
        : "";

    return {
      kind: "system",
      answer:
        `**Resumo do contexto da página** (${request.context.path ?? request.context.page})\n\n` +
        `- Filtros ativos: ${filtersSummary}.${totalInfo}${idsInfo}\n` +
        `- Os alertas na fila já vêm ordenados da maior para a menor nota de risco (amostra de controle ao final).\n\n` +
        `Esta resposta é demonstrativa; abra qualquer alerta da tabela para revisar sinais SHAP, grafo e parecer.`,
      sources: [],
      links: [
        { href: "/alerts", label: "Ver Fila de alertas" },
        { href: "/dashboard", label: "Ir para Visão geral" },
      ],
      model: usedModel,
    };
  }

  const links: ChatLink[] = [];
  if (/monitor/i.test(normalized)) {
    links.push({ href: "/monitoring", label: "Abrir Monitoramento" });
  } else if (/conta|account/i.test(normalized)) {
    links.push({ href: "/accounts", label: "Abrir Contas suspeitas" });
  } else if (/configura|setting/i.test(normalized)) {
    links.push({ href: "/settings", label: "Abrir Configurações" });
  } else {
    links.push({ href: "/dashboard", label: "Abrir Visão geral" });
    links.push({ href: "/alerts", label: "Ver Fila de alertas" });
  }

  return {
    kind: "system",
    answer:
      "Você pode navegar entre **Visão geral**, **Fila de alertas**, **Contas suspeitas**, **Monitoramento**, **Fontes de dados** e **Configurações** usando o menu lateral ou os atalhos abaixo.",
    sources: [],
    links,
    model: usedModel,
  };
}

function buildBaseAnswer(
  request: ChatRequest,
  usedModel: string,
): Omit<ChatResponse, "conversation_id"> {
  const normalized = request.message.trim().toLowerCase();

  if (GREETING_RE.test(normalized)) {
    return {
      kind: "small_talk",
      answer:
        "Olá! Posso ajudar com dúvidas sobre tipologias de PLD, regras da Lei nº 9.613/1998, telas do sistema e leitura dos alertas da fila.",
      sources: [],
      links: [],
      model: null,
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
      links: [],
      model: usedModel,
    };
  }

  if (DECISION_RE.test(normalized)) {
    const alertLabel = request.context.alert_id
      ? `no alerta #${request.context.alert_id}`
      : "nos dados analisados";
    return {
      kind: "decision",
      answer: [
        `**Indícios a favor**`,
        `- Concentração atípica de transferências na janela semanal ${alertLabel}, compatível com dispersão rápida de valores.`,
        `- Regras de cenário e contribuições SHAP apontam desvio relevante frente ao histórico recente da conta titular.`,
        ``,
        `**Indícios contra**`,
        `- Parte das contrapartes aparece em movimentações recorrentes de mesma moeda e praça, o que pode refletir atividade operacional legítima.`,
        `- Não há confirmação automática de vínculo ilícito nem histórico prévio de comunicação aprovada.`,
        ``,
        `**O que falta verificar**`,
        `- Confirmar a finalidade econômica das saídas no grafo de conexões e checar se houve alertas em semanas anteriores.`,
        `- Validar justificativa cadastral e compatibilidade de renda/faturamento fora do recorte transacional.`,
        ``,
        `**Força dos indícios:** moderada`,
        ``,
        `**Leitura sugerida:** aprofundar — revisar as contrapartes principais e a linha do tempo antes de decidir entre arquivar ou comunicar ao COAF.`,
      ].join("\n"),
      sources: [],
      links: [],
      model: usedModel,
    };
  }

  if (
    SYSTEM_IMPORT_RE.test(normalized) ||
    SYSTEM_PAGE_RE.test(normalized) ||
    SYSTEM_NAV_RE.test(normalized)
  ) {
    return buildSystemMockAnswer(request, usedModel);
  }

  if (DOMAIN_RE.test(normalized)) {
    if (normalized.includes("fan")) {
      return {
        kind: "domain",
        answer:
          "**Fan-out** é a dispersão rápida de recursos de uma única conta de origem para várias contas destinatárias.\n\n- Observe a concentração temporal das transferências.\n- Compare o valor total com o perfil histórico da conta.\n- Verifique contrapartes novas e saltos de segundo nível.\n\nO padrão é um indício analítico; a conclusão exige revisão humana.",
        sources: [],
        links: [],
        model: usedModel,
      };
    }

    if (
      request.context.alert_id ||
      normalized.includes("alerta") ||
      normalized.includes("alert")
    ) {
      return {
        kind: "domain",
        answer:
          "Comece conferindo as **regras acionadas** e as **contribuições SHAP** para entender o que elevou a nota de risco, depois valide as movimentações da janela semanal e as contrapartes no grafo.\n\nEsta resposta é demonstrativa e não substitui a revisão do caso.",
        sources: [],
        links: [],
        model: usedModel,
      };
    }

    return {
      kind: "domain",
      answer:
        "**Análise da semana**\n\nPriorize os alertas de maior nota de risco e revise as regras acionadas antes de registrar uma decisão. Use o detalhe do caso para consultar movimentações, conexões e o parecer.\n\nEsta resposta é demonstrativa e não conclui a ocorrência de lavagem de dinheiro.",
      sources: [],
      links: [],
      model: usedModel,
    };
  }

  return {
    kind: "out_of_scope",
    answer:
      "Posso responder apenas sobre prevenção à lavagem de dinheiro (PLD), tipologias, Lei nº 9.613/1998 e os alertas do FraudRadar.",
    sources: [],
    links: [],
    model: null,
  };
}

export function chatResponseMock(request: ChatRequest): ChatResponse {
  const usedModel = request.model ?? DEFAULT_MODEL_ID;
  const base = buildBaseAnswer(request, usedModel);

  // Rota de alerta não usa histórico persistido no servidor de chat global.
  if (request.context.alert_id) {
    return base;
  }

  const nowIso = new Date().toISOString();
  let targetId = request.conversation_id ?? null;

  if (targetId !== null) {
    const existing = conversationsStore.get(targetId);
    if (!existing) {
      throw new ApiError(
        getT("errors.api")("chat_conversation_not_found"),
        404,
        "chat.conversation_not_found",
      );
    }
    existing.updated_at = nowIso;
    existing.messages.push(
      {
        role: "user",
        content: request.message,
        sources: [],
        links: [],
        created_at: nowIso,
      },
      {
        role: "assistant",
        content: base.answer,
        kind: base.kind,
        sources: base.sources ?? [],
        links: base.links ?? [],
        model: base.model ?? null,
        created_at: nowIso,
      },
    );
  } else {
    targetId = nextConversationId++;
    const title = request.message.replace(/\s+/g, " ").trim().slice(0, 80) || "Conversa";
    conversationsStore.set(targetId, {
      id: targetId,
      title,
      updated_at: nowIso,
      messages: [
        {
          role: "user",
          content: request.message,
          sources: [],
          links: [],
          created_at: nowIso,
        },
        {
          role: "assistant",
          content: base.answer,
          kind: base.kind,
          sources: base.sources ?? [],
          links: base.links ?? [],
          model: base.model ?? null,
          created_at: nowIso,
        },
      ],
    });
  }

  return {
    ...base,
    conversation_id: targetId,
  };
}
