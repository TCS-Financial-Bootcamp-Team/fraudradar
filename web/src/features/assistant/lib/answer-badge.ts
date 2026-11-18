import type { ChatKind, Source } from "../schemas/assistant";

export interface AnswerBadgeInfo {
  kind: "legal" | "domain" | "decision" | "system";
  labelKey:
    | "badge.legal"
    | "badge.generalKnowledge"
    | "badge.domain"
    | "badge.decision"
    | "badge.system";
  tooltipKey?:
    | "badge.generalKnowledgeTooltip"
    | "badge.domainTooltip"
    | "badge.decisionTooltip"
    | "badge.systemTooltip";
}

/**
 * Resolve o selo discreto exibido abaixo da resposta do assistente.
 * Quando `kind` é omitido pela API, trata como `legal` se houver fontes;
 * para `legal` sem fundamentação (`grounded: false` ou sem fontes), exibe conhecimento geral.
 */
export function getAnswerBadge(
  kind?: ChatKind,
  sources?: readonly Source[],
  grounded?: boolean | null,
): AnswerBadgeInfo | null {
  const effectiveKind =
    kind ?? (sources && sources.length > 0 ? "legal" : undefined);

  if (effectiveKind === "legal") {
    const hasSources = Boolean(sources && sources.length > 0);
    if (grounded === false || (grounded == null && !hasSources)) {
      return {
        kind: "legal",
        labelKey: "badge.generalKnowledge",
        tooltipKey: "badge.generalKnowledgeTooltip",
      };
    }
    return { kind: "legal", labelKey: "badge.legal" };
  }
  if (effectiveKind === "domain") {
    return {
      kind: "domain",
      labelKey: "badge.domain",
      tooltipKey: "badge.domainTooltip",
    };
  }
  if (effectiveKind === "decision") {
    return {
      kind: "decision",
      labelKey: "badge.decision",
      tooltipKey: "badge.decisionTooltip",
    };
  }
  if (effectiveKind === "system") {
    return {
      kind: "system",
      labelKey: "badge.system",
      tooltipKey: "badge.systemTooltip",
    };
  }
  return null;
}
