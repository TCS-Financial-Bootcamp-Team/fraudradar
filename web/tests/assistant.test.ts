import assert from "node:assert/strict";
import { test } from "node:test";
import { getAnswerBadge } from "../src/features/assistant/lib/answer-badge";
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
});
