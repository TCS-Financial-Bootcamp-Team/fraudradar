import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssessmentMarkdown,
  getAssessmentSummary,
} from "../src/features/alerts/lib/assessment";
import { assessmentSchema } from "../src/features/alerts/schemas/alerts";
import { parseLegalSource } from "../src/lib/legal-sources";

test("assessment: usa summary explícito da API quando presente", () => {
  const parsed = assessmentSchema.parse({
    summary: "  Resumo direto da API.  ",
    content: "## Resumo\nOutro texto.",
    sources: [],
  });
  assert.equal(getAssessmentSummary(parsed), "Resumo direto da API.");
});

test("assessment: extrai seção ## Resumo quando summary está ausente", () => {
  const summary = getAssessmentSummary({
    content: [
      "## Resumo",
      "A conta concentrou **saídas sequenciais** em 24 horas [F1]. Recomenda-se revisão humana.",
      "",
      "## Sinais de risco",
      "- Regra R-014 acionada.",
    ].join("\n"),
  });
  assert.equal(
    summary,
    "A conta concentrou saídas sequenciais em 24 horas [F1]. Recomenda-se revisão humana.",
  );
});

test("assessment: cai no primeiro parágrafo e corta em limite de frase próximo a 300 chars", () => {
  const longContent = [
    "# Parecer",
    "",
    "A conta movimentou valores acima do histórico na janela semanal em análise e apresentou múltiplas contrapartes distintas em curto intervalo de tempo. " +
      "Esse comportamento coincide com alertas anteriores de dispersão rápida de recursos e exige verificação documental detalhada antes da decisão final. " +
      "Este terceiro período ultrapassa o limite de trezentos caracteres e não deve entrar inteiro no resumo curto exibido no card lateral.",
    "",
    "Segundo parágrafo ignorado.",
  ].join("\n");

  const summary = getAssessmentSummary({ content: longContent });
  assert.ok(summary.length <= 310);
  assert.ok(summary.endsWith("."));
  assert.ok(!summary.includes("terceiro período"));
  assert.ok(!summary.includes("Segundo parágrafo"));
});

test("assessment: corta com reticências se não houver fim de frase perto de 300 chars", () => {
  const singleSentence = "palavra ".repeat(60).trim() + ".";
  const summary = getAssessmentSummary({ content: singleSentence });
  assert.ok(summary.length <= 301);
  assert.ok(summary.endsWith("…"));
});

test("legal sources: extrai URL https oficial e remove linha do trecho", () => {
  const parsed = parseLegalSource({
    title: "[F1] Art. 11",
    excerpt:
      "Art. 11. As pessoas referidas devem comunicar ao COAF.\nFonte oficial: https://www.planalto.gov.br/ccivil_03/leis/l9613.htm",
  });
  assert.equal(parsed.title, "[F1] Art. 11");
  assert.equal(
    parsed.excerpt,
    "Art. 11. As pessoas referidas devem comunicar ao COAF.",
  );
  assert.equal(
    parsed.officialUrl,
    "https://www.planalto.gov.br/ccivil_03/leis/l9613.htm",
  );
});

test("legal sources: rejeita URLs não-https e preserva trechos sem URL", () => {
  const insecure = parseLegalSource({
    title: "[F2] Norma",
    excerpt: "Texto normativo. Fonte oficial: http://inseguro.example/doc",
  });
  assert.equal(insecure.officialUrl, null);
  assert.equal(insecure.excerpt, "Texto normativo.");

  const plain = parseLegalSource({
    title: "[F3] Guia",
    excerpt: "Texto sem link oficial.",
  });
  assert.equal(plain.officialUrl, null);
  assert.equal(plain.excerpt, "Texto sem link oficial.");
});

test("assessment export: monta Markdown com conteúdo e seção Fontes", () => {
  const md = buildAssessmentMarkdown(
    {
      content: "## Resumo\nTexto principal.",
      sources: [
        {
          title: "[F1] Art. 11",
          excerpt: "Texto do artigo.\nFonte oficial: https://example.com/art11",
        },
      ],
    },
    "Fontes",
  );
  assert.ok(md.includes("## Resumo\nTexto principal."));
  assert.ok(md.includes("## Fontes"));
  assert.ok(md.includes("- **[F1] Art. 11**"));
  assert.ok(md.includes("https://example.com/art11"));
});
