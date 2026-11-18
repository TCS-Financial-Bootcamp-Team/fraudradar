export const ASSISTANT_PANEL_WIDTH_STORAGE_KEY = "fraudradar.ai.panelWidth";
export const ASSISTANT_PANEL_DEFAULT_WIDTH = 400;
export const ASSISTANT_PANEL_MIN_WIDTH = 360;
export const ASSISTANT_PANEL_MAX_WIDTH = 900;
export const ASSISTANT_PANEL_MAX_VW_RATIO = 0.7;
export const ASSISTANT_PANEL_STEP_PX = 24;
export const ASSISTANT_PANEL_SMALL_SCREEN_BREAKPOINT = 640;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Indica se a largura da janela corresponde ao modo tela cheia no mobile (< 640px).
 */
export function isSmallViewport(viewportWidth?: number): boolean {
  return (
    typeof viewportWidth === "number" &&
    Number.isFinite(viewportWidth) &&
    viewportWidth > 0 &&
    viewportWidth < ASSISTANT_PANEL_SMALL_SCREEN_BREAKPOINT
  );
}

/**
 * Calcula a largura máxima permitida para o painel: min(900px, 70vw), nunca menor que o mínimo.
 */
export function getMaxPanelWidth(viewportWidth?: number): number {
  if (
    typeof viewportWidth !== "number" ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return ASSISTANT_PANEL_MAX_WIDTH;
  }
  const vwCap = Math.floor(viewportWidth * ASSISTANT_PANEL_MAX_VW_RATIO);
  return Math.max(
    ASSISTANT_PANEL_MIN_WIDTH,
    Math.min(ASSISTANT_PANEL_MAX_WIDTH, vwCap),
  );
}

/**
 * Limita a largura do painel entre o mínimo (360px) e o máximo permitido pela janela.
 */
export function clampPanelWidth(width: number, viewportWidth?: number): number {
  const maxWidth = getMaxPanelWidth(viewportWidth);
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return Math.min(
      maxWidth,
      Math.max(ASSISTANT_PANEL_MIN_WIDTH, ASSISTANT_PANEL_DEFAULT_WIDTH),
    );
  }
  const rounded = Math.round(width);
  return Math.min(maxWidth, Math.max(ASSISTANT_PANEL_MIN_WIDTH, rounded));
}

/**
 * Lê a largura persistida do painel no localStorage de forma segura e já limitada.
 */
export function readStoredPanelWidth(
  storage: StorageReader | null = getLocalStorage(),
  viewportWidth?: number,
): number {
  const fallback = clampPanelWidth(
    ASSISTANT_PANEL_DEFAULT_WIDTH,
    viewportWidth,
  );
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(ASSISTANT_PANEL_WIDTH_STORAGE_KEY);
    if (!raw || !raw.trim()) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return clampPanelWidth(parsed, viewportWidth);
  } catch {
    return fallback;
  }
}

/**
 * Persiste a largura do painel no localStorage, protegida contra erros de armazenamento.
 */
export function writeStoredPanelWidth(
  width: number,
  storage: StorageWriter | null = getLocalStorage(),
  viewportWidth?: number,
): void {
  if (!storage) return;
  const clamped = clampPanelWidth(width, viewportWidth);
  try {
    storage.setItem(ASSISTANT_PANEL_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Ignora falhas de armazenamento em ambientes restritos.
  }
}
