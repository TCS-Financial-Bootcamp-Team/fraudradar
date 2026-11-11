import { z } from "zod";

export type ThemeMode = "grafite" | "oceano" | "musgo" | "escuro" | "custom";
export type ThemeBase = "light" | "dark";

export interface ThemePreset {
  label: string;
  base: ThemeBase;
  bg: string;
  primary: string;
  accent: string;
  sidebar: string;
  topbar: string;
}

export const PRESETS: Record<Exclude<ThemeMode, "custom">, ThemePreset> = {
  grafite: {
    label: "Grafite",
    base: "light",
    bg: "#FAFAF9",
    primary: "#121212",
    accent: "#D4442E",
    sidebar: "#FAFAF9",
    topbar: "#FAFAF9",
  },
  oceano: {
    label: "Oceano",
    base: "light",
    bg: "#F5F6F8",
    primary: "#1F3A5F",
    accent: "#E0662F",
    sidebar: "#14213D",
    topbar: "#FFFFFF",
  },
  musgo: {
    label: "Musgo",
    base: "light",
    bg: "#F6F6F1",
    primary: "#2E4A3A",
    accent: "#C2571A",
    sidebar: "#F6F6F1",
    topbar: "#F6F6F1",
  },
  escuro: {
    label: "Escuro",
    base: "dark",
    bg: "#0E0E10",
    primary: "#EDEDEA",
    accent: "#FF6A4D",
    sidebar: "#0E0E10",
    topbar: "#0E0E10",
  },
};

export const customThemeSchema = z.object({
  base: z.enum(["light", "dark"]),
  primary: z.string(),
  accent: z.string(),
  sidebar: z.string(),
  topbar: z.string(),
  bg: z.string(),
  ink: z.string().nullable().optional(),
  sidebarInk: z.string().nullable().optional(),
  topbarInk: z.string().nullable().optional(),
});

export type CustomTheme = z.infer<typeof customThemeSchema>;

export const themeConfigSchema = z.object({
  mode: z.enum(["grafite", "oceano", "musgo", "escuro", "custom"]),
  custom: customThemeSchema,
});

export type ThemeConfig = z.infer<typeof themeConfigSchema>;

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  base: "light",
  primary: "#1F3A5F",
  accent: "#E0662F",
  sidebar: "#14213D",
  topbar: "#FFFFFF",
  bg: "#F5F6F8",
  ink: null,
  sidebarInk: null,
  topbarInk: null,
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  mode: "grafite",
  custom: DEFAULT_CUSTOM_THEME,
};
