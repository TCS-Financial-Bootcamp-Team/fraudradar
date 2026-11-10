"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_THEME_CONFIG,
  PRESETS,
  type ThemeConfig,
} from "@/lib/theme/presets";
import { computeTokens } from "@/lib/theme/tokens";
import { loadSavedTheme, saveTheme } from "@/lib/theme/storage";

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
  const [config, setConfigState] = useState<ThemeConfig>(() => {
    if (typeof window !== "undefined") {
      return loadSavedTheme();
    }
    return DEFAULT_THEME_CONFIG;
  });

  const tokens = useMemo(() => computeTokens(config), [config]);

  const isDark = useMemo(() => {
    return config.mode === "custom"
      ? config.custom.base === "dark"
      : PRESETS[config.mode]?.base === "dark";
  }, [config]);

  useEffect(() => {
    applyThemeToDocument(tokens, isDark);
    saveTheme(config, tokens, isDark);
  }, [config, tokens, isDark]);

  const setConfig = (
    configOrUpdater: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig)
  ) => {
    setConfigState((prev) => {
      return typeof configOrUpdater === "function"
        ? configOrUpdater(prev)
        : configOrUpdater;
    });
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      config,
      setConfig,
      tokens,
      isDark,
    }),
    [config, tokens, isDark]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    const defaultTokens = computeTokens(DEFAULT_THEME_CONFIG);
    return {
      config: DEFAULT_THEME_CONFIG,
      setConfig: () => {},
      tokens: defaultTokens,
      isDark: false,
    };
  }
  return ctx;
}
