import {
  DEFAULT_THEME_CONFIG,
  themeConfigSchema,
  type ThemeConfig,
} from "./presets";

export const THEME_STORAGE_KEY = "fraudradar-theme";

export interface StoredThemePayload {
  config: ThemeConfig;
  tokens: Record<string, string>;
  dark: boolean;
}

export function loadSavedTheme(): ThemeConfig {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_CONFIG;
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_CONFIG;

    const parsed = JSON.parse(raw);
    const candidate = parsed && typeof parsed === "object" && "config" in parsed
      ? parsed.config
      : parsed;

    const result = themeConfigSchema.safeParse(candidate);
    if (result.success) {
      return result.data;
    }
    return DEFAULT_THEME_CONFIG;
  } catch {
    return DEFAULT_THEME_CONFIG;
  }
}

export function saveTheme(
  config: ThemeConfig,
  tokens: Record<string, string>,
  dark: boolean
): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredThemePayload = {
      config,
      tokens,
      dark,
    };
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Falha silenciosa em navegadores com armazenamento bloqueado
  }
}

/**
 * Gerenciador do ciclo de vida de armazenamento do tema.
 *
 * Garante que o tema padrão usado durante a renderização do servidor e no primeiro
 * render da hidratação no cliente não sobrescreva o tema salvo no localStorage antes
 * que este tenha sido lido. Fornece snapshots estáveis para `useSyncExternalStore`.
 */
export class ThemeStorageLoader {
  private _isLoaded = false;
  private _currentConfig: ThemeConfig | null = null;
  private _listeners = new Set<() => void>();

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  /**
   * Snapshot para o servidor e para o primeiro render da hidratação no cliente.
   */
  getServerSnapshot = (): ThemeConfig => {
    return DEFAULT_THEME_CONFIG;
  };

  /**
   * Snapshot para o cliente após a hidratação.
   * Lê do localStorage na primeira chamada em ambiente cliente e armazena em cache
   * para manter estabilidade referencial exigida por `useSyncExternalStore`.
   */
  getSnapshot = (): ThemeConfig => {
    if (!this._isLoaded) {
      if (typeof window !== "undefined") {
        this._currentConfig = loadSavedTheme();
        this._isLoaded = true;
      } else {
        return DEFAULT_THEME_CONFIG;
      }
    }
    return this._currentConfig ?? DEFAULT_THEME_CONFIG;
  };

  /**
   * Inscreve um ouvinte para alterações de tema.
   */
  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  /**
   * Carrega o tema salvo do localStorage e marca o loader como inicializado.
   */
  load(): ThemeConfig {
    const config = loadSavedTheme();
    this._currentConfig = config;
    this._isLoaded = true;
    this.notify();
    return config;
  }

  /**
   * Grava o tema no localStorage apenas se o carregamento inicial já tiver ocorrido.
   * Evita sobrescrever uma preferência prévia com o valor padrão do primeiro render.
   */
  save(
    config: ThemeConfig,
    tokens: Record<string, string>,
    dark: boolean
  ): boolean {
    if (!this._isLoaded) {
      return false;
    }
    this._currentConfig = config;
    saveTheme(config, tokens, dark);
    this.notify();
    return true;
  }

  private notify(): void {
    for (const listener of this._listeners) {
      listener();
    }
  }

  /**
   * Redefine o estado de carregamento (útil para testes unitários).
   */
  reset(): void {
    this._isLoaded = false;
    this._currentConfig = null;
    this._listeners.clear();
  }
}

export const defaultThemeLoader = new ThemeStorageLoader();
