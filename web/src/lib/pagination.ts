export type PageItem = number | "ellipsis";

/** Garante que o número da página fique dentro do intervalo válido `1..totalPages`. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(totalPages) || totalPages < 1) return 1;
  const total = Math.trunc(totalPages);
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), total);
}

/**
 * Calcula os itens de paginação visíveis (sempre primeira, última, atual ± 1 e reticências).
 * Até 7 páginas, exibe todos os números para evitar reticências desnecessárias.
 */
export function getPageItems(current: number, totalPages: number): PageItem[] {
  if (!Number.isFinite(totalPages) || totalPages < 1) return [];
  const total = Math.trunc(totalPages);
  if (total === 1) return [1];
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const safeCurrent = clampPage(current, total);
  const pages = new Set<number>([1, total]);
  for (let offset = -1; offset <= 1; offset++) {
    const candidate = safeCurrent + offset;
    if (candidate >= 1 && candidate <= total) {
      pages.add(candidate);
    }
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PageItem[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const page = sorted[index];
    if (index > 0) {
      const gap = page - sorted[index - 1];
      if (gap === 2) {
        result.push(page - 1);
      } else if (gap > 2) {
        result.push("ellipsis");
      }
    }
    result.push(page);
  }
  return result;
}
