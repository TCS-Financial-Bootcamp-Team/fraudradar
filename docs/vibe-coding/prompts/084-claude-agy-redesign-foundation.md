---
id: 084
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: fase 1 do redesenho (temas, componentes base e notificações)

Plano do Claude: fase 1 (este prompt, um agy) monta a base; depois a fase 2 roda quatro agy em paralelo, cada um num git worktree próprio e com arquivos disjuntos (moldura e assistente; visão geral com os dados novos da API; fila e alerta; monitoramento, fontes, configurações e login). A especificação visual ficou em `web/DESIGN.md`; o protótipo aprovado foi copiado para `trash/prototype/` (fora do git) como referência.

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/web-redesign (already checked out). This is PHASE 1 of a front-end redesign: the foundation that four other agents will build the screens on afterwards. Do the foundation only; do not redesign individual screens.

Read first, and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/API_CONTRACTS.md, and especially web/DESIGN.md (the new design spec, approved by the product owner). The approved prototype is at trash/prototype/Main.dc.html (the whole app with all screens and the theme engine), Login.dc.html and Cadastro.dc.html. They are plain HTML with inline styles and a small JS class; use them as the visual and behavioral reference, including the theme math in `tokens()`, `mix()`, `lum()`, `contrast()` of Main.dc.html. Do not import or copy those files into the repo.

Rules: code identifiers in English; every on-screen text, comment and doc in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Do not change the API, the database, or anything outside web/.

## Deliverables

1. Theme engine (web/src/lib/theme/)
   - `presets.ts`: the four presets of web/DESIGN.md (grafite default, oceano, musgo, escuro) with label, base (light|dark), bg, primary, accent, sidebar, topbar.
   - `tokens.ts`: pure functions `mix`, `luminance`, `contrastRatio`, `isDark`, and `computeTokens(config)` that returns the full map of CSS variables (`--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--chart-1..5`, `--risk-low/medium/high/critical`, `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring`, plus the new `--signal`, `--sidebar-muted`, `--sidebar-divider`, `--topbar`, `--topbar-foreground`, `--topbar-muted`, `--topbar-border`, `--track`, `--chart-muted`, `--soft`). Same derivation rules as the prototype. Note: in shadcn `--accent` is the hover background, NOT our risk color; the risk/highlight color is `--signal`. `--destructive` should follow `--signal`.
   - Config type: `{ mode: "grafite"|"oceano"|"musgo"|"escuro"|"custom", custom: { base, primary, accent, sidebar, topbar, bg, ink?: string|null, sidebarInk?: string|null, topbarInk?: string|null } }`, validated with zod when read from storage (invalid → default).
   - `contrastWarnings(config)`: list of Portuguese messages for pairs below the minimum (content text vs card 4.5, sidebar text vs sidebar 4.5, topbar text vs topbar 4.5, accent vs card 3), like the prototype.
   - Storage key `fraudradar-theme` in localStorage, every access in try/catch.
2. Theme provider replacing next-themes
   - A client `AppThemeProvider` in web/src/components/theme/ that holds the config, writes the CSS variables on `document.documentElement`, toggles the `dark` class when the base is dark (so existing `dark:` utilities keep working), and persists it. Hook `useAppTheme()` returns `{ config, setConfig, tokens, isDark }`.
   - No flash on load: an inline script in web/src/app/layout.tsx `<head>` (before paint) that reads the saved computed variables from localStorage and applies them plus the `dark` class. Save the computed map together with the config so the script needs no math.
   - Replace every `next-themes` usage (providers.tsx, theme-toggle.tsx, ui/sonner.tsx, features/alerts/components/account-graph.tsx, features/settings/components/settings.tsx) with `useAppTheme()`. The old light/dark toggle button goes away (the Appearance panel replaces it); keep the file only if something still imports it, otherwise delete it. Leave the next-themes package in package.json.
   - Default when nothing is saved: Grafite.
3. Appearance panel (web/src/components/theme/appearance-panel.tsx)
   - The content of the prototype's "Aparência" dialog as a reusable component: theme cards with the mini preview (sidebar strip, bg, primary bar, accent bar), and for "Personalizado" the base switch (Clara/Escura), the five color inputs with hex, the three text-color inputs with "automático"/"Automático" reset, and the contrast warnings. It only renders the panel content; the header (another agent) will put it in a popover, and Settings (another agent) will embed it. Export a `ThemePreviewCards` part too, so Settings can show only the cards.
4. Base styles and primitives (match web/DESIGN.md)
   - web/src/app/console.css: replace the old palette with the Grafite defaults for `:root` (so SSR without JS is already Grafite) and restyle the shared classes `.panel` (card: radius 14px, 1px border, no shadow), `.panel-title`, `.page-heading` (context line + 30px title), `.eyebrow` (13px muted, no uppercase tracking), `.notice`, `.data-table` to the new look. Remove `.radar-art` and auth decorations only if no file uses them (check with grep); otherwise leave them for the auth agent.
   - web/src/app/globals.css: register the new tokens in `@theme inline` (`--color-signal`, `--color-track`, `--color-chart-muted`, `--color-soft`, `--color-topbar`, `--color-topbar-foreground`, `--color-topbar-muted`, `--color-topbar-border`, `--color-sidebar-muted`, `--color-sidebar-divider`).
   - components/ui: restyle button (variants default/primary 40px radius 8px weight 500, outline, ghost, link, destructive using `--signal`; sizes incl. icon 40px), card (radius 14px, no shadow), badge → add a `StatusDot` component (8px dot + text in foreground color; dot color passed as a token name), field (inputs 40px, radius 8px, label 13px weight 500), table (header 12px muted weight 400, rows with `--soft` borders, 13px vertical padding, tabular-nums), states (loading/empty/error in the minimal style), tooltip (dark: background foreground color, text background color, 12px, radius 6px), side-panel (right drawer 400px, border-left, no heavy shadow).
5. Notifications
   - Replace the sonner look with the prototype toast: max 4 stacked bottom-right; 8px kind dot (success = primary, info = track with muted ring, error = signal); title + body; × button with aria-label "Fechar notificação"; 2px progress bar that empties in 5s and pauses (animation-play-state) while the mouse is over the toast; right click (contextmenu) closes it. You may keep sonner underneath (`toast.custom` with your component; sonner already pauses its timer on hover) or write a small store; your choice, but the public API must be `notify.success(title, body?)`, `notify.info(...)`, `notify.error(...)` in web/src/lib/notify.ts, and every existing `toast.*` call in web/src must be migrated to it (grep `from "sonner"`).
6. Tests
   - web/tests/theme.test.ts: computeTokens returns every listed variable for each preset and for custom light/dark; automatic text is light on a dark sidebar and dark on a light one; a custom ink override wins; contrastWarnings flags a low-contrast custom config and not the presets; invalid stored config falls back to Grafite.
   - Update any existing test that breaks because of these changes (do not delete tests to make them pass).

## Verification (report exact summaries)
- cd web && pnpm lint && pnpm test && pnpm build (if build fails with TS2307 on .next/dev/types, delete web/.next and web/.next-test and retry).
- Visual check with Playwright on `pnpm dev -p 3010` with NEXT_PUBLIC_USE_MOCKS=true (set it only in that process's environment; do not edit web/.env.local): the existing screens must render with the Grafite look, switching to Escuro and to a custom theme must recolor sidebar, topbar and content with no flash after reload, and a notification must show the progress bar, pause on hover and close on right click. If the login blocks you in mocks, say so.

## Final report (Portuguese)
Files changed and why, the public API of the theme engine and of notify (signatures), test results, what was not verified, and any decision the other agents must know. Only claim what is actually in the diff.
````
