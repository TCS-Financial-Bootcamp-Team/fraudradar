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
