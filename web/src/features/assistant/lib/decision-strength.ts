export type EvidenceStrength = "weak" | "moderate" | "strong";

const STRENGTH_BY_TERM: Record<string, EvidenceStrength> = {
  fraca: "weak",
  moderada: "moderate",
  forte: "strong",
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Extrai a força dos indícios a partir de uma linha no formato
 * "Força dos indícios: fraca|moderada|forte" (tolerando markdown, acentos e caixa).
 */
export function parseEvidenceStrength(
  answer: string | null | undefined,
): EvidenceStrength | null {
  if (!answer) return null;

  for (const rawLine of answer.split(/\r?\n/)) {
    const cleaned = rawLine
      .trim()
      .replace(/^(?:#{1,6}\s+|[-*+]\s+|>\s+)+/, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (!cleaned) continue;

    const normalized = normalizeText(cleaned);
    const match = /^forca\s+dos\s+indicios\s*:\s*(fraca|moderada|forte)[.\s]*$/.exec(
      normalized,
    );
    if (match) {
      return STRENGTH_BY_TERM[match[1]] ?? null;
    }
  }

  return null;
}
