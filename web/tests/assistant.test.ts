import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../src/lib/api";
import { getAnswerBadge } from "../src/features/assistant/lib/answer-badge";
import {
  AI_MODEL_STORAGE_KEY,
  ALERT_CONTEXT_STORAGE_KEY,
  buildChatContext,
  buildChatRequest,
  formatRelativeDate,
  getContextChipLabel,
  getSuggestionKeys,
  parsePositiveIntId,
  readAlertContextEnabled,
  readStoredModel,
  resolveEffectiveAlertId,
  resolveSelectedModel,
  writeAlertContextEnabled,
  writeStoredModel,
} from "../src/features/assistant/lib/context";
import { parseEvidenceStrength } from "../src/features/assistant/lib/decision-strength";
import {
  filterAllowedLinks,
  isAllowedAssistantHref,
} from "../src/features/assistant/lib/links";
import {
  aiModelsResponseSchema,
  chatKindSchema,
  chatRequestSchema,
  chatResponseSchema,
  conversationDetailSchema,
  conversationListSchema,
  messageSchema,
  pageStateSchema,
} from "../src/features/assistant/schemas/assistant";
import {
  aiModelsMock,
  chatResponseMock,
  deleteConversationMock,
  fetchConversationMock,
  listConversationsMock,
} from "../src/features/assistant/services/mocks";
import { getT } from "../src/i18n/runtime";

const sampleSource = {
  title: "Lei nº 9.613/1998, art. 11",
  excerpt: "Comunicação ao COAF em 24 horas.",
};

test("chatResponseSchema aceita cada kind conhecido (inclusive system) e resposta sem kind", () => {
  for (const kind of chatKindSchema.options) {
    const parsed = chatResponseSchema.parse({
      answer: "Resposta de teste.",
      sources: kind === "legal" ? [sampleSource] : [],
      kind,
      links:
        kind === "system"
          ? [{ href: "/ingestion", label: "Abrir Fontes de dados" }]
          : [],
      model: "gemini-2.5-flash",
      conversation_id: 12,
    });
    assert.equal(parsed.kind, kind);
  }

  const withoutKind = chatResponseSchema.parse({
    answer: "Resposta de API antiga.",
    sources: [sampleSource],
  });
  assert.equal(withoutKind.kind, undefined);
  assert.equal(withoutKind.sources.length, 1);
  assert.deepEqual(withoutKind.links, []);

  assert.equal(
    chatResponseSchema.safeParse({
      answer: "Resposta inválida.",
      sources: [],
      kind: "unknown_kind",
    }).success,
    false,
  );

  const msg = messageSchema.parse({
    role: "assistant",
    content: "Conceito explicado.",
    kind: "domain",
  });
  assert.equal(msg.kind, "domain");
});

test("schemas de modelos, page_state, pedido e histórico validam limites do contrato", () => {
  const models = aiModelsResponseSchema.parse({
    default: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  });
  assert.equal(models.default, "gemini-2.5-flash");
  assert.equal(
    aiModelsResponseSchema.safeParse({ default: "x", models: [] }).success,
    false,
  );

  const validPageState = pageStateSchema.parse({
    filters: { week: "2026-10-19", status: "pending", page_ok: true, limit: 10, empty: null },
    visible_alert_ids: [3073, 3074],
    page: 1,
    total: 12,
  });
  assert.deepEqual(validPageState.visible_alert_ids, [3073, 3074]);

  const tooManyFilters: Record<string, string> = {};
  for (let i = 0; i < 21; i++) tooManyFilters[`k${i}`] = "v";
  assert.equal(
    pageStateSchema.safeParse({ filters: tooManyFilters, visible_alert_ids: [] })
      .success,
    false,
  );
  assert.equal(
    pageStateSchema.safeParse({
      filters: { ["k".repeat(41)]: "v" },
      visible_alert_ids: [],
    }).success,
    false,
  );
  assert.equal(
    pageStateSchema.safeParse({
      filters: { search: "a".repeat(101) },
      visible_alert_ids: [],
    }).success,
    false,
  );
  assert.equal(
    pageStateSchema.safeParse({
      filters: {},
      visible_alert_ids: Array.from({ length: 101 }, (_, i) => i + 1),
    }).success,
    false,
  );
  assert.equal(
    pageStateSchema.safeParse({
      filters: {},
      visible_alert_ids: [0],
    }).success,
    false,
  );

  assert.equal(
    chatRequestSchema.safeParse({
      message: "Olá",
      context: { page: "/alerts", week: "2026-10-19", path: "alerts" },
      history: [],
    }).success,
    false,
  );
  assert.ok(
    chatRequestSchema.safeParse({
      message: "Resuma os alertas",
      context: {
        page: "/alerts",
        week: "2026-10-19",
        path: "/alerts",
        page_state: validPageState,
      },
      history: [{ role: "user", content: "Oi" }],
      model: "gemini-2.5-pro",
      conversation_id: 12,
    }).success,
  );

  assert.ok(
    conversationListSchema.safeParse([
      {
        id: 12,
        title: "Conversa de teste",
        updated_at: "2026-11-18T10:00:00Z",
        message_count: 2,
      },
    ]).success,
  );
  assert.ok(
    conversationDetailSchema.safeParse({
      id: 12,
      title: "Conversa de teste",
      updated_at: "2026-11-18T10:00:00Z",
      messages: [
        {
          role: "user",
          content: "Onde importo?",
          sources: [],
          links: [],
        },
        {
          role: "assistant",
          content: "Em Fontes de dados.",
          kind: "system",
          sources: [],
          links: [{ href: "/ingestion", label: "Fontes de dados" }],
          model: "gemini-2.5-flash",
          created_at: "2026-11-18T10:00:01Z",
        },
      ],
    }).success,
  );
});

test("allowlist de links aceita rotas internas permitidas e descarta todo o resto", () => {
  for (const href of [
    "/dashboard",
    "/alerts",
    "/alerts/1",
    "/alerts/3073",
    "/accounts",
    "/monitoring",
    "/ingestion",
    "/settings",
  ]) {
    assert.equal(isAllowedAssistantHref(href), true, href);
  }

  for (const href of [
    "",
    "/",
    "/dashboard/",
    "/dashboard?tab=1",
    "/dashboard#sec",
    "/alerts/0",
    "/alerts/-5",
    "/alerts/007",
    "/alerts/abc",
    "/alerts/12/graph",
    "/login",
    "https://example.com/alerts",
    "http://localhost:3000/dashboard",
    "//evil.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    " /dashboard",
    "/dashboard\n",
  ]) {
    assert.equal(isAllowedAssistantHref(href), false, href);
  }

  const filtered = filterAllowedLinks([
    { href: "/alerts/3073", label: "  Abrir alerta 3073  " },
    { href: "javascript:alert(1)", label: "XSS" },
    { href: "/alerts?status=pending", label: "Com query" },
    { href: "/ingestion", label: "   " },
    { href: "/monitoring", label: "a".repeat(61) },
    { href: "/dashboard", label: "Visão geral" },
    { href: "/accounts", label: "Contas" },
    { href: "/monitoring", label: "Monitoramento" },
    { href: "/ingestion", label: "Ingestão" },
    { href: "/settings", label: "Configurações" },
  ]);
  assert.deepEqual(filtered, [
    { href: "/alerts/3073", label: "Abrir alerta 3073" },
    { href: "/dashboard", label: "Visão geral" },
    { href: "/accounts", label: "Contas" },
    { href: "/monitoring", label: "Monitoramento" },
    { href: "/ingestion", label: "Ingestão" },
  ]);
});

test("getAnswerBadge retorna a chave esperada para cada kind (inclusive system) e para respostas legadas", () => {
  const t = getT("assistant");

  const legal = getAnswerBadge("legal", [sampleSource]);
  assert.deepEqual(legal, { kind: "legal", labelKey: "badge.legal" });
  assert.equal(t(legal.labelKey), "Com base na Lei 9.613/1998");

  const domain = getAnswerBadge("domain", []);
  assert.deepEqual(domain, {
    kind: "domain",
    labelKey: "badge.domain",
    tooltipKey: "badge.domainTooltip",
  });
  assert.equal(t(domain.labelKey), "Resposta geral, sem fonte jurídica");
  assert.equal(
    t(domain.tooltipKey!),
    "Explicação de conceito; para obrigações legais, pergunte o que a lei exige.",
  );

  const system = getAnswerBadge("system", []);
  assert.deepEqual(system, {
    kind: "system",
    labelKey: "badge.system",
    tooltipKey: "badge.systemTooltip",
  });
  assert.equal(t(system.labelKey), "Sistema");

  assert.equal(getAnswerBadge("small_talk", []), null);
  assert.equal(getAnswerBadge("out_of_scope", []), null);

  const decision = getAnswerBadge("decision", []);
  assert.deepEqual(decision, {
    kind: "decision",
    labelKey: "badge.decision",
    tooltipKey: "badge.decisionTooltip",
  });
  assert.equal(t(decision.labelKey), "Apoio à decisão — a decisão é sua");
  assert.equal(
    t(decision.tooltipKey!),
    "Sugestão baseada nos dados do alerta; não registra decisão.",
  );

  // Compatibilidade com API antiga sem `kind`: com fontes -> legal; sem fontes -> sem selo.
  assert.deepEqual(getAnswerBadge(undefined, [sampleSource]), {
    kind: "legal",
    labelKey: "badge.legal",
  });
  assert.equal(getAnswerBadge(undefined, []), null);
  assert.equal(getAnswerBadge(undefined, undefined), null);
});

test("chatResponseMock cobre os kinds (inclusive system) e fluxo de conversas no modo demonstração", () => {
  const baseContext = { page: "/dashboard", path: "/dashboard", week: "2026-10-19" };

  const smallTalk = chatResponseMock({
    message: "Olá!",
    context: baseContext,
    history: [],
  });
  assert.equal(smallTalk.kind, "small_talk");
  assert.equal(smallTalk.sources.length, 0);
  assert.equal(typeof smallTalk.conversation_id, "number");

  const domain = chatResponseMock({
    message: "O que é fan-out?",
    context: baseContext,
    history: [],
  });
  assert.equal(domain.kind, "domain");
  assert.equal(domain.sources.length, 0);

  const systemImport = chatResponseMock({
    message: "Onde eu importo transações?",
    context: baseContext,
    history: [],
    model: "gemini-2.5-pro",
  });
  assert.equal(systemImport.kind, "system");
  assert.equal(systemImport.model, "gemini-2.5-pro");
  assert.ok(systemImport.links.some((l) => l.href === "/ingestion"));

  const legalLei = chatResponseMock({
    message: "O que a lei exige ao comunicar ao COAF?",
    context: baseContext,
    history: [],
  });
  assert.equal(legalLei.kind, "legal");
  assert.ok(legalLei.sources.length > 0);

  const legalArt = chatResponseMock({
    message: "O que diz o art. 11 sobre prazos?",
    context: baseContext,
    history: [],
  });
  assert.equal(legalArt.kind, "legal");
  assert.ok(legalArt.sources.length > 0);

  const outOfScope = chatResponseMock({
    message: "Quem dirigiu Titanic?",
    context: baseContext,
    history: [],
  });
  assert.equal(outOfScope.kind, "out_of_scope");
  assert.equal(outOfScope.sources.length, 0);

  const decision = chatResponseMock({
    message: "Isso parece lavagem de verdade?",
    context: { ...baseContext, alert_id: "3126" },
    history: [],
  });
  assert.equal(decision.kind, "decision");
  assert.equal(decision.sources.length, 0);
  for (const section of [
    "Indícios a favor",
    "Indícios contra",
    "O que falta verificar",
    "Força dos indícios:",
    "Leitura sugerida:",
  ]) {
    assert.ok(decision.answer.includes(section), `faltou seção: ${section}`);
  }
  assert.equal(parseEvidenceStrength(decision.answer), "moderate");

  // Fluxo de histórico no mock: listar, continuar, reabrir, remover e 404.
  const convId = systemImport.conversation_id!;
  const continued = chatResponseMock({
    message: "Resuma os alertas desta página",
    context: {
      page: "/alerts",
      path: "/alerts",
      week: "2026-10-19",
      page_state: {
        filters: { status: "pending" },
        visible_alert_ids: [3073],
        page: 1,
        total: 10,
      },
    },
    history: [{ role: "user", content: "Onde eu importo transações?" }],
    conversation_id: convId,
  });
  assert.equal(continued.conversation_id, convId);
  assert.equal(continued.kind, "system");

  const list = listConversationsMock();
  assert.ok(list.some((item) => item.id === convId && item.message_count === 4));
  const detail = fetchConversationMock(convId);
  assert.equal(detail.messages.length, 4);
  deleteConversationMock(convId);
  assert.throws(
    () => fetchConversationMock(convId),
    (err: unknown) => err instanceof ApiError && err.code === "chat.conversation_not_found",
  );
  assert.equal(aiModelsMock().default, "gemini-2.5-flash");
});

test("parseEvidenceStrength reconhece fraca, moderada e forte ignorando acentos e caixa", () => {
  assert.equal(parseEvidenceStrength("Força dos indícios: fraca"), "weak");
  assert.equal(
    parseEvidenceStrength("**Força dos indícios:** moderada"),
    "moderate",
  );
  assert.equal(
    parseEvidenceStrength("### FORCA DOS INDICIOS: FORTE."),
    "strong",
  );
  assert.equal(
    parseEvidenceStrength("- forca dos indicios: **Fraca**"),
    "weak",
  );
  assert.equal(
    parseEvidenceStrength("Resumo\nForça dos indícios: Moderada\nFim"),
    "moderate",
  );

  assert.equal(parseEvidenceStrength("Resposta sem linha de força."), null);
  assert.equal(
    parseEvidenceStrength("Força dos indícios: inconclusiva"),
    null,
  );
  assert.equal(
    parseEvidenceStrength("Força dos indícios: fraca ou moderada"),
    null,
  );
  assert.equal(parseEvidenceStrength(""), null);
  assert.equal(parseEvidenceStrength(undefined), null);
});

test("getSuggestionKeys varia entre detalhe de alerta, fila /alerts e demais páginas", () => {
  const t = getT("assistant.suggestions");

  const alertKeys = getSuggestionKeys("3126", "/alerts/3126");
  assert.deepEqual(
    alertKeys.map((k) => t(k)),
    [
      "Isso parece lavagem de verdade?",
      "O que pesa contra este alerta?",
      "O que falta verificar antes de decidir?",
      "O que a lei exige ao comunicar ao COAF?",
    ],
  );

  const queueKeys = getSuggestionKeys(undefined, "/alerts");
  assert.deepEqual(
    queueKeys.map((k) => t(k)),
    [
      "Quais destes alertas têm a nota mais alta?",
      "Resuma os alertas desta página",
      "Onde eu importo transações?",
      "O que é a tipologia fan-out?",
      "O que a lei exige ao comunicar ao COAF?",
    ],
  );

  const generalKeys = getSuggestionKeys(undefined, "/dashboard");
  assert.deepEqual(
    generalKeys.map((k) => t(k)),
    [
      "O que é a tipologia fan-out?",
      "O que a lei exige ao comunicar ao COAF?",
      "Onde eu importo transações?",
    ],
  );
});

test("buildChatRequest e preferência de contexto controlam page_state, alert_id, model e conversation_id", () => {
  assert.equal(resolveEffectiveAlertId("3126", true), "3126");
  assert.equal(resolveEffectiveAlertId("3126", false), undefined);
  assert.equal(resolveEffectiveAlertId(undefined, true), undefined);

  const pageState = {
    filters: { week: "2026-10-19", status: "pending" },
    visible_alert_ids: [3073, 3074],
    page: 1,
    total: 12,
  };

  const withPageState = buildChatRequest({
    message: "Quais destes alertas têm a nota mais alta?",
    page: "/alerts",
    path: "/alerts",
    week: "2026-10-19",
    shareAlertContext: true,
    pageState,
    model: "gemini-2.5-pro",
    conversationId: 42,
    history: [{ role: "user", content: "Oi" }],
  });
  assert.deepEqual(withPageState.context, {
    page: "/alerts",
    week: "2026-10-19",
    path: "/alerts",
    page_state: pageState,
  });
  assert.equal(withPageState.model, "gemini-2.5-pro");
  assert.equal(withPageState.conversation_id, 42);
  assert.equal(withPageState.history.length, 1);

  const withoutPageState = buildChatRequest({
    message: "Analise sem contexto",
    page: "/alerts",
    path: "/alerts",
    week: "2026-10-19",
    alertId: "3126",
    shareAlertContext: false,
    pageState,
    history: [{ role: "user", content: "Anterior" }],
  });
  assert.equal("alert_id" in withoutPageState.context, false);
  assert.equal("page_state" in withoutPageState.context, false);
  assert.deepEqual(withoutPageState.context, {
    page: "/alerts",
    week: "2026-10-19",
    path: "/alerts",
  });
  assert.equal("model" in withoutPageState, false);
  assert.equal("conversation_id" in withoutPageState, false);

  const withAlertContext = buildChatContext({
    page: "/alerts/3126",
    path: "/alerts/3126",
    week: "2026-10-19",
    alertId: "3126",
    shareAlertContext: true,
  });
  assert.deepEqual(withAlertContext, {
    page: "/alerts/3126",
    week: "2026-10-19",
    path: "/alerts/3126",
    alert_id: "3126",
  });

  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  assert.equal(readAlertContextEnabled(fakeStorage), true);
  writeAlertContextEnabled(false, fakeStorage);
  assert.equal(store.get(ALERT_CONTEXT_STORAGE_KEY), "false");
  assert.equal(readAlertContextEnabled(fakeStorage), false);
  writeAlertContextEnabled(true, fakeStorage);
  assert.equal(readAlertContextEnabled(fakeStorage), true);

  const throwingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readAlertContextEnabled(throwingStorage), true);
  assert.doesNotThrow(() => writeAlertContextEnabled(false, throwingStorage));
});

test("persistência do modelo em localStorage e fallback para o padrão do servidor", () => {
  const store = new Map<string, string>();
  const fakeStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  assert.equal(readStoredModel(fakeStorage), null);
  writeStoredModel("gemini-2.5-pro", fakeStorage);
  assert.equal(store.get(AI_MODEL_STORAGE_KEY), "gemini-2.5-pro");
  assert.equal(readStoredModel(fakeStorage), "gemini-2.5-pro");

  const catalog = {
    default: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  };
  assert.equal(resolveSelectedModel("gemini-2.5-pro", catalog), "gemini-2.5-pro");
  assert.equal(resolveSelectedModel("gemini-1.5-pro", catalog), "gemini-2.5-flash");
  assert.equal(resolveSelectedModel(null, catalog), "gemini-2.5-flash");

  const throwingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readStoredModel(throwingStorage), null);
  assert.doesNotThrow(() => writeStoredModel("gemini-2.5-pro", throwingStorage));
});

test("helpers de chip de contexto, IDs inteiros e data relativa", () => {
  assert.equal(parsePositiveIntId("3073"), 3073);
  assert.equal(parsePositiveIntId("0"), null);
  assert.equal(parsePositiveIntId("ALT-2401"), null);
  assert.equal(parsePositiveIntId(42), 42);

  assert.equal(
    getContextChipLabel({ pathname: "/alerts/3073", alertId: "3073" }),
    "Contexto: Alerta #3073",
  );
  assert.equal(
    getContextChipLabel({ pathname: "/alerts", visibleCount: 12 }),
    "Contexto: Alertas (12 visíveis)",
  );
  assert.equal(
    getContextChipLabel({ pathname: "/dashboard" }),
    "Contexto: Dashboard",
  );

  const now = Date.UTC(2026, 10, 18, 12, 0, 0);
  assert.equal(
    formatRelativeDate("2026-11-18T11:59:45Z", "pt-BR", now),
    "agora",
  );
  assert.match(
    formatRelativeDate("2026-11-18T10:00:00Z", "pt-BR", now),
    /2 horas/,
  );
  assert.equal(
    formatRelativeDate("2026-11-17T12:00:00Z", "en", now),
    "yesterday",
  );
});
