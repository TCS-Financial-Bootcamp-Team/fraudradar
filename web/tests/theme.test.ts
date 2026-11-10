import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_THEME_CONFIG,
  PRESETS,
  type ThemeConfig,
} from "../src/lib/theme/presets";
import {
  computeTokens,
  contrastWarnings,
  contrastRatio,
  isDark,
  luminance,
  mix,
} from "../src/lib/theme/tokens";
import {
  loadSavedTheme,
  saveTheme,
  ThemeStorageLoader,
  THEME_STORAGE_KEY,
} from "../src/lib/theme/storage";

const REQUIRED_VARIABLES = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--secondary",
  "--secondary-foreground",
  "--muted",
  "--muted-foreground",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--border",
  "--input",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--risk-low",
  "--risk-medium",
  "--risk-high",
  "--risk-critical",
  "--warning",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-accent-foreground",
  "--sidebar-border",
  "--sidebar-primary",
  "--sidebar-primary-foreground",
  "--sidebar-ring",
  "--signal",
  "--sidebar-muted",
  "--sidebar-divider",
  "--topbar",
  "--topbar-foreground",
  "--topbar-muted",
  "--topbar-border",
  "--track",
  "--chart-muted",
  "--soft",
];

test("theme: pure functions mix, luminance e contrastRatio seguem a matemática do protótipo", () => {
  // mix
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(mix("#101010", "#101010", 0.2), "#101010");

  // luminance
  assert.equal(luminance("#000000"), 0);
  assert.equal(Math.round(luminance("#ffffff")), 1);

  // contrastRatio
  const blackOnWhite = contrastRatio("#000000", "#ffffff");
  assert.ok(blackOnWhite >= 20.5 && blackOnWhite <= 21.5);
  const sameColor = contrastRatio("#ffffff", "#ffffff");
  assert.equal(sameColor, 1);
});

test("theme: computeTokens retorna todas as variáveis obrigatórias para cada preset e custom light/dark", () => {
  const configs: ThemeConfig[] = [
    { mode: "grafite", custom: DEFAULT_THEME_CONFIG.custom },
    { mode: "oceano", custom: DEFAULT_THEME_CONFIG.custom },
    { mode: "musgo", custom: DEFAULT_THEME_CONFIG.custom },
    { mode: "escuro", custom: DEFAULT_THEME_CONFIG.custom },
    {
      mode: "custom",
      custom: {
        base: "light",
        primary: "#1F3A5F",
        accent: "#E0662F",
        sidebar: "#14213D",
        topbar: "#FFFFFF",
        bg: "#F5F6F8",
      },
    },
    {
      mode: "custom",
      custom: {
        base: "dark",
        primary: "#EDEDEA",
        accent: "#FF6A4D",
        sidebar: "#0E0E10",
        topbar: "#0E0E10",
        bg: "#0E0E10",
      },
    },
  ];

  for (const cfg of configs) {
    const tokens = computeTokens(cfg);
    for (const varName of REQUIRED_VARIABLES) {
      assert.ok(
        tokens[varName] !== undefined && tokens[varName] !== "",
        `Token ausente ${varName} no tema ${cfg.mode} (base: ${
          cfg.mode === "custom" ? cfg.custom.base : PRESETS[cfg.mode].base
        })`
      );
    }
    assert.ok(
      contrastRatio(tokens["--warning"], tokens["--card"]) >= 3,
      `--warning precisa de contraste ≥ 3:1 contra o card no tema ${cfg.mode}`
    );
  }
});

test("theme: texto automático é claro em barra lateral escura e escuro em barra lateral clara", () => {
  // Oceano: sidebar escura (#14213D) -> texto deve ser claro (#F2F3F5)
  const oceanoTokens = computeTokens({
    mode: "oceano",
    custom: DEFAULT_THEME_CONFIG.custom,
  });
  assert.equal(oceanoTokens["--sidebar-foreground"], "#F2F3F5");
  assert.equal(isDark(PRESETS.oceano.sidebar), true);

  // Grafite: sidebar clara (#FAFAF9) -> texto deve ser escuro (#111111)
  const grafiteTokens = computeTokens({
    mode: "grafite",
    custom: DEFAULT_THEME_CONFIG.custom,
  });
  assert.equal(grafiteTokens["--sidebar-foreground"], "#111111");
  assert.equal(isDark(PRESETS.grafite.sidebar), false);

  // Custom com sidebar preta (#000000) -> texto claro (#F2F3F5)
  const customDarkSide = computeTokens({
    mode: "custom",
    custom: {
      base: "light",
      primary: "#111111",
      accent: "#FF0000",
      sidebar: "#000000",
      topbar: "#FFFFFF",
      bg: "#FAFAF9",
    },
  });
  assert.equal(customDarkSide["--sidebar-foreground"], "#F2F3F5");

  // Custom com sidebar branca (#FFFFFF) -> texto escuro (#111111)
  const customLightSide = computeTokens({
    mode: "custom",
    custom: {
      base: "light",
      primary: "#111111",
      accent: "#FF0000",
      sidebar: "#FFFFFF",
      topbar: "#FFFFFF",
      bg: "#FAFAF9",
    },
  });
  assert.equal(customLightSide["--sidebar-foreground"], "#111111");
});

test("theme: personalização explícita de ink/cor de texto tem prioridade sobre o automático", () => {
  const customOverride: ThemeConfig = {
    mode: "custom",
    custom: {
      base: "light",
      primary: "#1F3A5F",
      accent: "#E0662F",
      sidebar: "#14213D",
      topbar: "#FFFFFF",
      bg: "#F5F6F8",
      ink: "#123456",
      sidebarInk: "#654321",
      topbarInk: "#ABCDEF",
    },
  };

  const tokens = computeTokens(customOverride);
  assert.equal(tokens["--foreground"], "#123456");
  assert.equal(tokens["--card-foreground"], "#123456");
  assert.equal(tokens["--sidebar-foreground"], "#654321");
  assert.equal(tokens["--topbar-foreground"], "#ABCDEF");
});

test("theme: contrastWarnings sinaliza pares de baixo contraste no custom e não nos presets", () => {
  // Nenhum preset deve ter avisos de contraste
  for (const mode of ["grafite", "oceano", "musgo", "escuro"] as const) {
    const warnings = contrastWarnings({
      mode,
      custom: DEFAULT_THEME_CONFIG.custom,
    });
    assert.deepEqual(
      warnings,
      [],
      `Preset ${mode} não deveria gerar avisos de contraste`
    );
  }

  // Custom com baixo contraste: texto quase branco no card branco
  const lowContrastCustom: ThemeConfig = {
    mode: "custom",
    custom: {
      base: "light",
      primary: "#1F3A5F",
      accent: "#FAFAFA", // Destaque quase branco no fundo branco
      sidebar: "#14213D",
      topbar: "#FFFFFF",
      bg: "#FFFFFF",
      ink: "#F0F0F0", // Texto do conteúdo quase branco
    },
  };

  const warnings = contrastWarnings(lowContrastCustom);
  assert.ok(warnings.length > 0, "Deveria emitir avisos para contraste baixo");
  assert.ok(
    warnings.some((w) => w.includes("O texto do conteúdo fica difícil de ler")),
    "Deve conter aviso sobre o texto do conteúdo"
  );
  assert.ok(
    warnings.some((w) => w.includes("O destaque fica difícil de ler")),
    "Deve conter aviso sobre o destaque"
  );
});

test("theme: configuração inválida no storage reverte para o padrão Grafite", () => {
  // Mock simples de localStorage em ambiente node
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => storageMap.set(key, val),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  // Atribui global temporariamente
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mockLocalStorage,
  };

  try {
    // 1. JSON quebrado
    mockLocalStorage.setItem(THEME_STORAGE_KEY, "{quebrado:true");
    const r1 = loadSavedTheme();
    assert.equal(r1.mode, "grafite");

    // 2. Modo inexistente
    mockLocalStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode: "neon-futuro", custom: DEFAULT_THEME_CONFIG.custom })
    );
    const r2 = loadSavedTheme();
    assert.equal(r2.mode, "grafite");

    // 3. Objeto vazio
    mockLocalStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({}));
    const r3 = loadSavedTheme();
    assert.equal(r3.mode, "grafite");

    // 4. Configuração válida salva com tokens
    const validConfig: ThemeConfig = {
      mode: "escuro",
      custom: DEFAULT_THEME_CONFIG.custom,
    };
    saveTheme(validConfig, computeTokens(validConfig), true);
    const r4 = loadSavedTheme();
    assert.equal(r4.mode, "escuro");
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    }
  }
});

test("theme: carregamento da configuração salva não é sobrescrito pelo padrão do primeiro render", () => {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => storageMap.set(key, val),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
  };

  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mockLocalStorage,
  };

  try {
    // 1. Simula usuário com tema 'escuro' já salvo anteriormente no localStorage
    const savedConfig: ThemeConfig = {
      mode: "escuro",
      custom: DEFAULT_THEME_CONFIG.custom,
    };
    saveTheme(savedConfig, computeTokens(savedConfig), true);

    // 2. Cria instância do loader/storage responsável pelo ciclo de vida
    const loader = new ThemeStorageLoader();
    assert.equal(loader.isLoaded, false);

    // 3. Simula tentativa prematura de salvar o tema padrão antes do mount/load terminar
    // (o que aconteceria no primeiro render do cliente / hidratação caso o efeito disparasse)
    const defaultSaved = loader.save(
      DEFAULT_THEME_CONFIG,
      computeTokens(DEFAULT_THEME_CONFIG),
      false
    );
    assert.equal(defaultSaved, false, "Gravação antes da carga deve ser ignorada");

    // Verifica que o tema no localStorage NÃO foi sobrescrito pelo default
    const currentRaw = mockLocalStorage.getItem(THEME_STORAGE_KEY);
    assert.ok(currentRaw !== null);
    const parsed = JSON.parse(currentRaw);
    assert.equal(
      parsed.config.mode,
      "escuro",
      "O tema salvo deve permanecer 'escuro' no localStorage"
    );

    // 4. Executa a carga (simulando a montagem pós-hidratação)
    const loadedConfig = loader.load();
    assert.equal(loadedConfig.mode, "escuro");
    assert.equal(loader.isLoaded, true);

    // 5. Após carregado, alterações subsequentes válidas são persistidas normalmente
    const novoTema: ThemeConfig = {
      mode: "oceano",
      custom: DEFAULT_THEME_CONFIG.custom,
    };
    const savedSuccess = loader.save(
      novoTema,
      computeTokens(novoTema),
      false
    );
    assert.equal(savedSuccess, true, "Gravação pós-carga deve ser permitida");

    const updatedRaw = mockLocalStorage.getItem(THEME_STORAGE_KEY);
    const updatedParsed = JSON.parse(updatedRaw!);
    assert.equal(updatedParsed.config.mode, "oceano");
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else {
      (globalThis as unknown as { window: unknown }).window = originalWindow;
    }
  }
});
