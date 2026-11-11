---
id: 086
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Antigravity (agy CLI, gemini-3.8-flash-high)
pai: 083
data: 2026-11-10
---

# Delegação ao agy: correções da base (hidratação do tema e notificação que não some com movimento reduzido)

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch feat/web-redesign. Phase 1 of the front redesign (theme engine, primitives, notifications) is committed. A code review found two defects in it. Four other agents are working IN PARALLEL in other git worktrees on the screens; they do not touch the files below, and you must not touch anything else.

You own ONLY: web/src/components/theme/theme-provider.tsx, web/src/lib/theme/storage.ts, web/src/components/ui/sonner.tsx, web/src/lib/notify.ts, web/src/app/console.css (only the reduced-motion and toast rules), and web/tests/theme.test.ts plus a new web/tests/notify.test.ts.

Follow AGENTS.md, web/AGENTS.md and web/DESIGN.md. Comments and on-screen text in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/.

1. Hydration mismatch in AppThemeProvider
   `useState(() => typeof window !== "undefined" ? loadSavedTheme() : DEFAULT)` makes the first client render differ from the server render whenever a theme is saved (the Settings page renders the AppearancePanel with the selected theme, so markup and aria-pressed differ → React hydration error). Fix: the first render (server and client) must use the default config; read the saved config after mount (e.g. useSyncExternalStore with getServerSnapshot = default, or a mount effect), and make sure the effect that writes CSS variables and SAVES to localStorage never runs with the default before the saved config was loaded (otherwise it overwrites the user's saved theme on every load). The pre-paint script in app/layout.tsx already prevents the color flash; keep it working. Satisfy the repo's ESLint rules (react-hooks) without disabling them.
2. Toasts never disappear with reduced motion
   Dismissal depends on `onAnimationEnd` with `elapsedTime >= 4.5`, but console.css sets `animation-duration: 0.01ms !important` under `prefers-reduced-motion: reduce`, so the animation ends at ~0s, the check fails and the toast stays forever. Make the 5s lifetime a JS timer owned by the toast (remaining time that pauses on mouseenter and resumes on mouseleave, also paused while the toast has keyboard focus), and keep the progress bar purely visual (it may keep the CSS animation with animation-play-state, or be driven by the remaining time). With reduced motion the toast still disappears after 5s (the bar may simply not animate). Right click and × still close it.
3. Tests: web/tests/notify.test.ts for the store (push/dismiss/max 4 stacked, ids increase) and, in web/tests/theme.test.ts, that loading a saved config does not get overwritten by the default (unit-test the storage/loader logic you extract to make this testable).

Verification (report exact summaries): cd web && pnpm lint && pnpm test && pnpm build. Visual check with Playwright on `pnpm dev -p 3010` with NEXT_PUBLIC_USE_MOCKS=true set only in that process: save the Escuro theme, reload /settings and confirm there is no hydration error in the console and the theme is still Escuro; emulate reduced motion (page.emulateMedia({ reducedMotion: 'reduce' })) and confirm a toast disappears after ~5s, pauses while hovered.

Final report in Portuguese: files changed, test results, what was not verified. Only claim what is in the diff.
````
