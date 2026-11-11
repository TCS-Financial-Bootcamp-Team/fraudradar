"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_THEME_CONFIG,
  PRESETS,
  type ThemeConfig,
} from "@/lib/theme/presets";
import { computeTokens } from "@/lib/theme/tokens";
import { defaultThemeLoader } from "@/lib/theme/storage";

export interface ThemeContextValue {
  config: ThemeConfig;
  setConfig: (
    configOrUpdater: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig)
  ) => void;
  tokens: Record<string, string>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(tokens: Record<string, string>, isDark: boolean) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value);
  }
  if (isDark) {
    el.classList.add("dark");
  } else {
    el.classList.remove("dark");
  }
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  // useSyncExternalStore garante que o servidor e o primeiro render da hidratação no cliente
  // usem getServerSnapshot (DEFAULT_THEME_CONFIG), evitando erro de mismatch de hidratação.
  // Imediatamente após a hidratação, o React sincroniza com getSnapshot (tema salvo).
  const config = useSyncExternalStore(
    defaultThemeLoader.subscribe,
    defaultThemeLoader.getSnapshot,
    defaultThemeLoader.getServerSnapshot
  );

  const tokens = useMemo(() => computeTokens(config), [config]);

  const isDark = useMemo(() => {
    return config.mode === "custom"
      ? config.custom.base === "dark"
      : PRESETS[config.mode]?.base === "dark";
  }, [config]);

  // Aplica as variáveis CSS ao documentElement quando os tokens ou o modo escuro mudam
  useEffect(() => {
    applyThemeToDocument(tokens, isDark);
  }, [tokens, isDark]);

  const setConfig = useCallback(
    (configOrUpdater: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig)) => {
      const nextConfig =
        typeof configOrUpdater === "function"
          ? configOrUpdater(config)
          : configOrUpdater;

      const nextTokens = computeTokens(nextConfig);
      const nextDark =
        nextConfig.mode === "custom"
          ? nextConfig.custom.base === "dark"
          : PRESETS[nextConfig.mode]?.base === "dark";

      defaultThemeLoader.save(nextConfig, nextTokens, nextDark);
    },
    [config]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      config,
      setConfig,
      tokens,
      isDark,
    }),
    [config, setConfig, tokens, isDark]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

const DEFAULT_TOKENS = computeTokens(DEFAULT_THEME_CONFIG);
const subscribeNada = () => () => {};

/**
 * Cada consumidor lê o tema padrão no próprio primeiro render (servidor e hidratação)
 * e só depois o tema salvo. Isso vale por componente: uma fronteira Suspense que hidrata
 * tarde veria o contexto já atualizado e divergiria do HTML do servidor.
 */
export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  const hidratado = useSyncExternalStore(
    subscribeNada,
    () => true,
    () => false
  );
  const setConfig = ctx?.setConfig;
  const padrao = useMemo<ThemeContextValue>(
    () => ({
      config: DEFAULT_THEME_CONFIG,
      setConfig: setConfig ?? (() => {}),
      tokens: DEFAULT_TOKENS,
      isDark: false,
    }),
    [setConfig]
  );
  return ctx && hidratado ? ctx : padrao;
}
