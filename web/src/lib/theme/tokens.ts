import { PRESETS, type ThemeConfig } from "./presets";

export function hex(c: string): [number, number, number] {
  let clean = c.trim();
  if (clean.startsWith("#")) clean = clean.slice(1);
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(v)))
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

export function mix(a: string, b: string, w: number): string {
  const x = hex(a);
  const y = hex(b);
  return toHex(
    x[0] + (y[0] - x[0]) * w,
    x[1] + (y[1] - x[1]) * w,
    x[2] + (y[2] - x[2]) * w
  );
}

export function luminance(c: string): number {
  const v = hex(c).map((u) => {
    const norm = u / 255;
    return norm <= 0.03928
      ? norm / 12.92
      : Math.pow((norm + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function isDark(c: string): boolean {
  return luminance(c) < 0.2;
}

export function computeTokens(config: ThemeConfig): Record<string, string> {
  const isCustomMode = config.mode === "custom";
  const p =
    config.mode === "custom"
      ? { label: "Personalizado", ...config.custom }
      : PRESETS[config.mode] ?? PRESETS.grafite;

  const dark = p.base === "dark";
  const autoInk = dark ? "#EDEDEA" : mix(p.primary, "#111111", 0.7);
  const surface = dark ? mix(p.bg, "#FFFFFF", 0.05) : "#FFFFFF";
  const autoSideInk = isDark(p.sidebar) ? "#F2F3F5" : dark ? "#EDEDEA" : autoInk;
  const autoTopInk = isDark(p.topbar) ? "#F2F3F5" : dark ? "#EDEDEA" : autoInk;

  const ink = (isCustomMode && config.custom.ink) || autoInk;
  const sidebarInk = (isCustomMode && config.custom.sidebarInk) || autoSideInk;
  const topbarInk = (isCustomMode && config.custom.topbarInk) || autoTopInk;

  const sideDark = isDark(p.sidebar);
  const topDark = isDark(p.topbar);

  const muted = mix(ink, surface, 0.4);
  const line = dark ? mix(p.bg, "#FFFFFF", 0.12) : mix(p.bg, "#000000", 0.08);
  const soft = dark ? mix(p.bg, "#FFFFFF", 0.08) : mix(p.bg, "#000000", 0.04);
  const track = dark ? mix(p.bg, "#FFFFFF", 0.1) : mix(p.bg, "#000000", 0.06);
  const chartMuted = dark ? mix(p.bg, "#FFFFFF", 0.22) : mix(p.bg, p.primary, 0.18);
  const onPrimary = isDark(p.primary) ? "#FAFAF9" : "#111111";

  const sidebarMuted = mix(sidebarInk, p.sidebar, 0.38);
  const sidebarActive = sideDark
    ? mix(p.sidebar, "#FFFFFF", 0.1)
    : mix(p.sidebar, "#000000", 0.06);
  const sidebarLine = sideDark
    ? p.sidebar
    : dark
    ? mix(p.bg, "#FFFFFF", 0.12)
    : mix(p.bg, "#000000", 0.08);
  const sidebarDivider = sideDark
    ? mix(p.sidebar, "#FFFFFF", 0.12)
    : mix(p.sidebar, "#000000", 0.08);

  const topbarMuted = mix(topbarInk, p.topbar, 0.38);
  const topbarLine = topDark
    ? mix(p.topbar, "#FFFFFF", 0.12)
    : mix(p.topbar, "#000000", 0.08);

  const secondary = soft;
  const accentHover = soft;

  return {
    "--background": p.bg,
    "--foreground": ink,
    "--card": surface,
    "--card-foreground": ink,
    "--popover": surface,
    "--popover-foreground": ink,
    "--primary": p.primary,
    "--primary-foreground": onPrimary,
    "--secondary": secondary,
    "--secondary-foreground": ink,
    "--muted": soft,
    "--muted-foreground": muted,
    "--accent": accentHover,
    "--accent-foreground": ink,
    "--destructive": p.accent,
    "--border": line,
    "--input": line,
    "--ring": p.primary,
    "--chart-1": p.primary,
    "--chart-2": chartMuted,
    "--chart-3": p.accent,
    "--chart-4": muted,
    "--chart-5": line,
    "--risk-low": dark ? "#52b788" : "#2d6a4f",
    "--risk-medium": dark ? "#e0a96d" : "#b07d38",
    "--risk-high": p.accent,
    "--risk-critical": p.accent,
    // Âmbar de "Em investigação": contraste ≥ 3:1 contra o card (branco no claro).
    "--warning": dark ? "#e0a96d" : "#b7791f",
    "--sidebar": p.sidebar,
    "--sidebar-foreground": sidebarInk,
    "--sidebar-accent": sidebarActive,
    "--sidebar-accent-foreground": sidebarInk,
    "--sidebar-border": sidebarLine,
    "--sidebar-primary": p.primary,
    "--sidebar-primary-foreground": onPrimary,
    "--sidebar-ring": p.primary,
    "--signal": p.accent,
    "--sidebar-muted": sidebarMuted,
    "--sidebar-divider": sidebarDivider,
    "--topbar": p.topbar,
    "--topbar-foreground": topbarInk,
    "--topbar-muted": topbarMuted,
    "--topbar-border": topbarLine,
    "--track": track,
    "--chart-muted": chartMuted,
    "--soft": soft,
  };
}

export function contrastWarnings(config: ThemeConfig): string[] {
  if (config.mode !== "custom") return [];

  const tokens = computeTokens(config);
  const ink = tokens["--foreground"];
  const surface = tokens["--card"];
  const sidebar = tokens["--sidebar"];
  const sidebarInk = tokens["--sidebar-foreground"];
  const topbar = tokens["--topbar"];
  const topbarInk = tokens["--topbar-foreground"];
  const accent = tokens["--signal"];

  const checks: [string, string, number, string][] = [
    [ink, surface, 4.5, "O texto do conteúdo"],
    [sidebarInk, sidebar, 4.5, "O texto da barra lateral"],
    [topbarInk, topbar, 4.5, "O texto da barra superior"],
    [accent, surface, 3, "O destaque"],
  ];

  return checks
    .filter(([a, b, min]) => contrastRatio(a, b) < min)
    .map(
      ([a, b, min, what]) =>
        `${what} fica difícil de ler (contraste de ${contrastRatio(a, b)
          .toFixed(1)
          .replace(".", ",")} para 1; o mínimo é ${String(min).replace(
          ".",
          ","
        )} para 1).`
    );
}
