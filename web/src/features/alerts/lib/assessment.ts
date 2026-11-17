import { parseLegalSource } from "@/lib/legal-sources";

const SUMMARY_MAX_CHARS = 300;
const RESUMO_SECTION_RE =
  /^##[ \t]+Resumo[ \t]*\n([\s\S]*?)(?=\n##[ \t]+|\s*$)/im;

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,6}[ \t]+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]+/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstParagraph(content: string): string {
  const blocks = content
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^#{1,6}[ \t]+/.test(line));
    if (lines.length > 0) {
      return lines.join(" ");
    }
  }
  return content;
}

function truncateAtSentenceBoundary(text: string, maxChars = SUMMARY_MAX_CHARS): string {
  if (text.length <= maxChars) return text;

  const sentenceEndRe = /[.!?](?=\s|$)/g;
  let lastValidEnd = -1;
  let firstOverLimitEnd = -1;

  for (const match of text.matchAll(sentenceEndRe)) {
    const end = (match.index ?? 0) + 1;
    const before = text.slice(0, end);
    // Evita cortar em abreviações jurídicas curtas como "Art." ou "Inc."
    if (/\b(?:art|inc|par|inciso|al|n|nr)\.$/i.test(before)) continue;

    if (end <= maxChars) {
      if (end >= 40) lastValidEnd = end;
    } else if (end <= maxChars + 40 && firstOverLimitEnd === -1) {
      firstOverLimitEnd = end;
      break;
    }
  }

  if (lastValidEnd !== -1) {
    return text.slice(0, lastValidEnd).trim();
  }
  if (firstOverLimitEnd !== -1) {
    return text.slice(0, firstOverLimitEnd).trim();
  }

  const slice = text.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Obtém o resumo curto do parecer da IA: usa `summary` da API quando presente
 * ou deriva da seção `## Resumo` / primeiro parágrafo em até ~300 caracteres.
 */
export function getAssessmentSummary(assessment: {
  content: string;
  summary?: string | null;
}): string {
  const explicit = assessment.summary?.trim();
  if (explicit) return explicit;

  const match = RESUMO_SECTION_RE.exec(assessment.content.replace(/\r\n?/g, "\n"));
  const raw = match?.[1]?.trim() ? match[1] : firstParagraph(assessment.content);
  const normalized = normalizeText(raw);
  return truncateAtSentenceBoundary(normalized);
}

/** Monta o arquivo Markdown para download com o parecer completo e suas fontes. */
export function buildAssessmentMarkdown(
  assessment: {
    content: string;
    sources: Array<{ title: string; excerpt: string }>;
  },
  sourcesHeading: string,
): string {
  const base = assessment.content.trim();
  if (assessment.sources.length === 0) return `${base}\n`;

  const lines = assessment.sources.map((source) => {
    const parsed = parseLegalSource(source);
    const parts = [`- **${parsed.title}**`];
    if (parsed.excerpt) parts.push(`  ${parsed.excerpt}`);
    if (parsed.officialUrl) parts.push(`  ${parsed.officialUrl}`);
    return parts.join("\n");
  });

  return `${base}\n\n## ${sourcesHeading}\n\n${lines.join("\n\n")}\n`;
}
