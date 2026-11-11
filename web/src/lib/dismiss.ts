// Lógica pura para fechar menus e popovers ao clicar fora ou apertar Escape.

export interface ContainsNode {
  contains(node: unknown): boolean;
}

/** Verdadeiro quando o alvo do clique está fora de todos os elementos dados. */
export function isOutside(
  target: unknown,
  elements: ReadonlyArray<ContainsNode | null | undefined>,
): boolean {
  return !elements.some((element) => element?.contains(target));
}

export function isEscape(event: { key: string }): boolean {
  return event.key === "Escape";
}
