import assert from "node:assert/strict";
import { test } from "node:test";
import { getAnswerBadge } from "../src/features/assistant/lib/answer-badge";
import {
  ALERT_CONTEXT_STORAGE_KEY,
  buildChatContext,
  buildChatRequest,
  getSuggestionKeys,
  readAlertContextEnabled,
  resolveEffectiveAlertId,
  writeAlertContextEnabled,
} from "../src/features/assistant/lib/context";
import { parseEvidenceStrength } from "../src/features/assistant/lib/decision-strength";
import {
  chatKindSchema,
  chatResponseSchema,
  messageSchema,
} from "../src/features/assistant/schemas/assistant";
import { chatResponseMock } from "../src/features/assistant/services/mocks";
import { getT } from "../src/i18n/runtime";

const sampleSource = {
  title: "Lei nº 9.613/1998, art. 11",
  excerpt: "Comunicação ao COAF em 24 horas.",
};

test("chatResponseSchema aceita cada kind conhecido e resposta sem kind", () => {
  for (const kind of chatKindSchema.options) {
    const parsed = chatResponseSchema.parse({
      answer: "Resposta de teste.",
      sources: kind === "legal" ? [sampleSource] : [],
      kind,
    });
    assert.equal(parsed.kind, kind);
  }

  const withoutKind = chatResponseSchema.parse({
    answer: "Resposta de API antiga.",
    sources: [sampleSource],
  });
  assert.equal(withoutKind.kind, undefined);
  assert.equal(withoutKind.sources.length, 1);

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

test("getAnswerBadge retorna a chave esperada para cada kind e para respostas legadas", () => {
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

test("chatResponseMock cobre os quatro kinds do roteador no modo demonstração", () => {
  const baseContext = { page: "/dashboard", week: "2026-10-19" };

  const smallTalk = chatResponseMock({
    message: "Olá!",
    context: baseContext,
    history: [],
  });
  assert.equal(smallTalk.kind, "small_talk");
  assert.equal(smallTalk.sources.length, 0);

  const domain = chatResponseMock({
    message: "O que é fan-out?",
    context: baseContext,
    history: [],
  });
  assert.equal(domain.kind, "domain");
  assert.equal(domain.sources.length, 0);

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

test("getSuggestionKeys varia entre página de alerta e demais páginas", () => {
  const t = getT("assistant.suggestions");

  const alertKeys = getSuggestionKeys("3126");
  assert.deepEqual(
    alertKeys.map((k) => t(k)),
    [
      "Isso parece lavagem de verdade?",
      "O que pesa contra este alerta?",
      "O que falta verificar antes de decidir?",
      "O que a lei exige ao comunicar ao COAF?",
    ],
  );

  const generalKeys = getSuggestionKeys(undefined);
  assert.deepEqual(
    generalKeys.map((k) => t(k)),
    [
      "O que é a tipologia fan-out?",
      "O que a lei exige ao comunicar ao COAF?",
    ],
  );
});

test("preferência de contexto do alerta controla alert_id e persiste só na sessão", () => {
  assert.equal(resolveEffectiveAlertId("3126", true), "3126");
  assert.equal(resolveEffectiveAlertId("3126", false), undefined);
  assert.equal(resolveEffectiveAlertId(undefined, true), undefined);

  const withContext = buildChatRequest({
    message: "Analise este alerta",
    page: "/alerts/3126",
    week: "2026-10-19",
    alertId: "3126",
    shareAlertContext: true,
    history: [{ role: "user", content: "Oi" }],
  });
  assert.deepEqual(withContext.context, {
    page: "/alerts/3126",
    week: "2026-10-19",
    alert_id: "3126",
  });

  const withoutContext = buildChatContext({
    page: "/alerts/3126",
    week: "2026-10-19",
    alertId: "3126",
    shareAlertContext: false,
  });
  assert.equal("alert_id" in withoutContext, false);
  assert.deepEqual(withoutContext, {
    page: "/alerts/3126",
    week: "2026-10-19",
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
