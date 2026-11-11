---
id: 096
area: frontend
autor: Claude Code (conta 1, do Pedro)
destino: Codex CLI (conta 2 do Pedro)
pai: 095
data: 2026-11-11
---

# Delegação ao Codex: tirar o status do sistema, dica do menu recolhido e linha inteira clicável na fila

Prompt enviado, na íntegra:

````text
You are working in the FraudRadar PLD repository at C:\codigo\pessoal\fraudradar, branch fix/web-polish-after-redesign (already checked out). You are Codex running non-interactively: do not ask questions; print a final report in Portuguese at the end. Read first and follow: AGENTS.md, .agents/skills/fraudradar/SKILL.md, web/AGENTS.md, web/DESIGN.md. On-screen text and comments in Brazilian Portuguese. Do NOT commit, push or open a PR. Do NOT touch docs/vibe-coding/prompts/. Never print secrets from .env or web/.env.local. Change only what these three items need, plus tests.

1. Remove the health badge ("Sistema operacional" / "Sistema degradado") from the dashboard header (web/src/features/alerts/components/dashboard.tsx). The product owner does not want analysts to see system status on the main screen. The health information stays only in Settings → Sistema. If HealthBadge (web/src/features/health/components/health-badge.tsx) is no longer used anywhere, delete it and its tests/imports.
2. Collapsed sidebar tooltip is clipped on its left side by the sidebar (web/src/components/layout/sidebar.tsx uses CollapsedTooltip from web/src/components/ui/tooltip.tsx). Make it render outside the sidebar's clipping/stacking context (portal to body, positioned to the right of the item with an 8–12px gap, vertically centered), above the sidebar and the top bar, never clipped, on hover and on keyboard focus, with the existing dark style (background foreground color, text background color, 12px, radius 6px). Keep its accessible label. Check the profile button tooltip in the collapsed sidebar too.
3. In the alert queue (/alerts, web/src/features/alerts/components/alerts-table.tsx, also used by "Comece por aqui" on the dashboard) only the alert number is a link. Make the whole row open the alert: clicking anywhere on the row (account, score, country, value, status) navigates to /alerts/{id}; cursor pointer and hover background on the row; keyboard: the row (or a full-row link overlay) must be reachable with Tab and open with Enter, with an accessible name like "Abrir alerta 3126, conta 1225052083". Do not nest interactive elements inside another link; a common pattern is keeping the id link and adding an `after:absolute after:inset-0` stretched-link on the row (row `relative`), or onClick on the row plus the existing link for keyboard. Text selection in cells may stay possible.

Verification (report exact summaries): cd web && pnpm lint && pnpm test && pnpm build. Visual check is optional: the proxy redirects to /login without a Supabase session even with mocks; if blocked, say so.
````
