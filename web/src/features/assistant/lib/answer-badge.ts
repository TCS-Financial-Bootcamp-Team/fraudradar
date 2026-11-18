import type { ChatKind, Source } from "../schemas/assistant";

export interface AnswerBadgeInfo {
  kind: "legal" | "domain" | "decision" | "system";
  labelKey: "badge.legal" | "badge.domain" | "badge.decision" | "badge.system";
  tooltipKey?:
    | "badge.domainTooltip"
    | "badge.decisionTooltip"
    | "badge.systemTooltip";
}

/**
 * Resolve o selo discreto exibido abaixo da resposta do assistente.
 * Quando `kind` é omitido pela API, trata como `legal` se houver fontes;
 * sem `kind` e sem fontes, não exibe selo.
 */
export function getAnswerBadge(
  kind?: ChatKind,
  sources?: readonly Source[],
): AnswerBadgeInfo | null {
  const effectiveKind =
    kind ?? (sources && sources.length > 0 ? "legal" : undefined);

  if (effectiveKind === "legal") {
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
