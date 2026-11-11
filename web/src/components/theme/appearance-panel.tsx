"use client";

import React, { useId } from "react";
import {
  PRESETS,
  type ThemeMode,
  type CustomTheme,
} from "@/lib/theme/presets";
import {
  contrastWarnings,
  isDark as checkIsDark,
  mix,
} from "@/lib/theme/tokens";
import { useAppTheme } from "./theme-provider";

export function ThemePreviewCards({
  mode,
  onSelectMode,
  custom,
}: {
  mode: ThemeMode;
  onSelectMode: (mode: ThemeMode) => void;
  custom: CustomTheme;
}) {
  const themeKeys: ThemeMode[] = [
    "grafite",
    "oceano",
    "musgo",
    "escuro",
    "custom",
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {themeKeys.map((k) => {
        const d =
          k === "custom"
            ? custom
            : PRESETS[k];
        const label = k === "custom" ? "Personalizado" : PRESETS[k].label;
        const isActive = mode === k;

        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelectMode(k)}
            aria-pressed={isActive}
            className={`flex flex-col gap-1.5 p-1.5 rounded-[10px] text-left transition-colors bg-card ${
              isActive
                ? "border-[1.5px] border-foreground"
                : "border-[1.5px] border-border hover:border-foreground/50"
            }`}
          >
            <span className="flex h-11 overflow-hidden rounded-[6px] border border-border">
              <span
                className="w-[30%] shrink-0"
                style={{ backgroundColor: d.sidebar }}
              />
              <span
                className="flex flex-1 flex-col justify-end gap-1 p-1.5"
                style={{ backgroundColor: d.bg }}
              >
                <span
                  className="h-1 w-[70%] rounded-[2px]"
                  style={{ backgroundColor: d.primary }}
                />
                <span
                  className="h-1 w-[40%] rounded-[2px]"
                  style={{ backgroundColor: d.accent }}
                />
              </span>
            </span>
            <span className="text-xs font-medium px-0.5 truncate text-foreground">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function AppearancePanel({ className }: { className?: string }) {
  const { config, setConfig } = useAppTheme();
  const baseId = useId();

  const isCustom = config.mode === "custom";
  const custom = config.custom;
  const isDarkBase = custom.base === "dark";

  const autoInk = isDarkBase
    ? "#EDEDEA"
    : mix(custom.primary, "#111111", 0.7);
  const autoSideInk = checkIsDark(custom.sidebar)
    ? "#F2F3F5"
    : isDarkBase
    ? "#EDEDEA"
    : autoInk;
  const autoTopInk = checkIsDark(custom.topbar)
    ? "#F2F3F5"
    : isDarkBase
    ? "#EDEDEA"
    : autoInk;

  const autoTextMap = {
    sidebarInk: autoSideInk,
    topbarInk: autoTopInk,
    ink: autoInk,
  };

  const warnings = contrastWarnings(config);

  const handleModeChange = (mode: ThemeMode) => {
    setConfig((prev) => ({
      ...prev,
      mode,
    }));
  };

  const handleBaseChange = (base: "light" | "dark") => {
    const defaults =
      base === "dark"
        ? {
            bg: "#111318",
            topbar: "#111318",
            primary: "#E8EAEE",
            ink: null,
            topbarInk: null,
          }
        : {
            bg: "#F5F6F8",
            topbar: "#FFFFFF",
            primary: "#1F3A5F",
            ink: null,
            topbarInk: null,
          };

    setConfig((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        ...defaults,
        base,
      },
    }));
  };

  const handleCustomColorChange = (key: keyof CustomTheme, value: string) => {
    setConfig((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        [key]: value,
      },
    }));
  };

  const handleResetTextColor = (key: "sidebarInk" | "topbarInk" | "ink") => {
    setConfig((prev) => ({
      ...prev,
      custom: {
        ...prev.custom,
        [key]: null,
      },
    }));
  };

  const colorFields: { key: keyof CustomTheme; label: string }[] = [
    { key: "primary", label: "Primária" },
    { key: "accent", label: "Destaque (risco)" },
    { key: "sidebar", label: "Barra lateral" },
    { key: "topbar", label: "Barra superior" },
    { key: "bg", label: "Fundo" },
  ];

  const textFields: {
    key: "sidebarInk" | "topbarInk" | "ink";
    label: string;
  }[] = [
    { key: "sidebarInk", label: "Barra lateral" },
    { key: "topbarInk", label: "Barra superior" },
    { key: "ink", label: "Conteúdo" },
  ];

  return (
    <div className={`flex flex-col gap-4 text-foreground ${className ?? ""}`}>
      <fieldset className="m-0 p-0 border-0">
        <legend className="mb-2.5 p-0 text-[13px] text-muted-foreground">
          Tema
        </legend>
        <ThemePreviewCards
          mode={config.mode}
          onSelectMode={handleModeChange}
          custom={config.custom}
        />
      </fieldset>

      {isCustom && (
        <div className="flex flex-col gap-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Base</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => handleBaseChange("light")}
                aria-pressed={!isDarkBase}
                className={`h-8 px-3.5 text-[13px] border-0 transition-colors ${
                  !isDarkBase
                    ? "bg-foreground text-background font-medium"
                    : "bg-transparent text-foreground hover:bg-muted"
                }`}
              >
                Clara
              </button>
              <button
                type="button"
                onClick={() => handleBaseChange("dark")}
                aria-pressed={isDarkBase}
                className={`h-8 px-3.5 text-[13px] border-0 transition-colors ${
                  isDarkBase
                    ? "bg-foreground text-background font-medium"
                    : "bg-transparent text-foreground hover:bg-muted"
                }`}
              >
                Escura
              </button>
            </div>
          </div>

          <p className="mt-1.5 mb-0 text-[11px] font-medium tracking-[0.06em] uppercase text-muted-foreground">
            Cores
          </p>

          {colorFields.map((field) => {
            const rawVal = custom[field.key] as string;
            const valUpper = (rawVal || "").toUpperCase();
            const inputId = `${baseId}-${field.key}`;

            return (
              <label
                key={field.key}
                htmlFor={inputId}
                className="flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="text-[13px] text-foreground">
                  {field.label}
                </span>
                <span className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {valUpper}
                  </span>
                  <input
                    id={inputId}
                    type="color"
                    value={rawVal}
                    aria-label={field.label}
                    onChange={(e) =>
                      handleCustomColorChange(field.key, e.target.value)
                    }
                    className="size-8 rounded-md border border-border p-0 cursor-pointer bg-transparent"
                  />
                </span>
              </label>
            );
          })}

          <p className="mt-1.5 mb-0 text-[11px] font-medium tracking-[0.06em] uppercase text-muted-foreground">
            Cor do texto
          </p>

          {textFields.map((field) => {
            const own = !!custom[field.key];
            const currentVal = own ? (custom[field.key] as string) : autoTextMap[field.key];
            const valUpper = currentVal.toUpperCase();
            const inputId = `${baseId}-${field.key}`;

            return (
              <div
                key={field.key}
                className="flex items-center justify-between gap-3"
              >
                <label htmlFor={inputId} className="text-[13px] text-foreground">
                  {field.label}
                </label>
                <span className="flex items-center gap-2">
                  {own ? (
                    <button
                      type="button"
                      onClick={() => handleResetTextColor(field.key)}
                      className="h-[26px] px-2 rounded-md border border-border bg-transparent text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    >
                      Automático
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      automático
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    {valUpper}
                  </span>
                  <input
                    id={inputId}
                    type="color"
                    value={currentVal}
                    aria-label={`Cor do texto: ${field.label}`}
                    onChange={(e) =>
                      handleCustomColorChange(field.key, e.target.value)
                    }
                    className="size-8 rounded-md border border-border p-0 cursor-pointer bg-transparent"
                  />
                </span>
              </div>
            );
          })}

          {warnings.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              {warnings.map((w, idx) => (
                <p
                  key={idx}
                  className="m-0 p-2.5 rounded-lg bg-soft text-xs text-foreground leading-relaxed"
                >
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="m-0 text-xs text-muted-foreground">
        Cada analista escolhe o próprio tema. Fica salvo neste navegador, inclusive no login.
      </p>
    </div>
  );
}
