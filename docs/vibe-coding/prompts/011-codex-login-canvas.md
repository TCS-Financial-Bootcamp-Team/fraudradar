---
id: 011
autor: Claude Code
destino: Codex (escritor)
pai: 010
data: 2026-10-26
area: frontend
modelo: gpt-6.1-sol / reasoning high
---

Continue work on branch feat/frontend-base in C:\codigo\pessoal\fraudradar (Windows, pnpm). Read AGENTS.md, web/AGENTS.md, vibelog/AGENTS.md and the relevant guides in web/node_modules/next/dist/docs/ (Next 16.4, cacheComponents-style prerendering) first. Do not touch api/, worker/, src/, db/. UI text PT-BR. Do not commit. Supabase email confirmation is already DISABLED (mailer_autoconfirm=true): sign-up now returns a session immediately — adjust the cadastro flow in web/ to go straight to /dashboard (keep handling the case where no session is returned).

## 1. Bug (web/, highest priority)
Opening /dashboard in `pnpm dev` shows: `Route "/dashboard": Next.js encountered the unstable value Date.now() while prerendering` with stack `SupabaseAuthClient.__loadSession (GoTrueClient.ts:3067) -> _useSession -> _emitInitialSession -> LayoutApp`. So the (app) layout (or something it renders) touches the Supabase auth client during prerender. Fix the root cause the way the Next 16 docs recommend (dynamic access such as `await connection()`/cookies() inside a Suspense boundary, or move the session read to the client after mount) — do not just silence it. Check every route of web/ and vibelog/ for the same class of error: run `pnpm dev`, request each route with curl (with and without auth cookie where possible) and make sure the dev server log has no "Blocking Route"/prerender errors; `pnpm build` must also pass.

## 2. Auth UX (web/ and vibelog/)
- Password inputs: an eye button to show/hide the password (aria-label "Mostrar senha"/"Ocultar senha", aria-pressed, keyboard accessible). Make it a reusable component in each app.
- "Manter conectado" checkbox on login (the product owner called it "lembrar senha"). NEVER store the password ourselves. Checked = persistent Supabase auth cookies (long maxAge); unchecked = session cookies (no maxAge/expires) so the session ends when the browser closes. Implement via @supabase/ssr cookie options in both browser and server/proxy clients, driven by a small preference cookie (e.g. `fr_manter_conectado`). Default checked. Use proper `autocomplete` attributes (email, current-password, new-password) so the browser's password manager can offer to save the password — mention this in a hint.
- vibelog/: add a "Criar conta" link/button on the login page to a new `/cadastro` page (nome, e-mail, senha + confirmação, same Supabase project; name in user_metadata), protected by the proxy like /login. Readers are still read-only.

## 3. VibeLog redesign: Supabase-dashboard minimalism + infinite canvas
- Visual language close to the Supabase dashboard: neutral grays, dark by default (light theme kept), single emerald accent (~#3ECF8E) for primary actions/active states, thin 1px borders, compact density, small uppercase labels, monospace for ids/branches/commits, no heavy shadows or gradients. Sidebar with the view switcher and filters, top bar with project name, search and theme toggle.
- New default view "Quadro": infinite canvas using @xyflow/react (React Flow) with automatic top-down tree layout (dagre or elkjs). Each node is a compact card: tipo icon + color, area chip, autor, titulo (2 lines), date; edges pai -> filho as smooth lines (animated for prompt_ia). Pan/zoom with mouse and trackpad, zoom controls, minimap, fit-view button, "centralizar no selecionado". Click a node -> right side panel with the full detail (reuse existing detail component). Filters apply to the canvas keeping ancestors (dim nodes that are only ancestors instead of hiding them). Collapse/expand subtree per node. Must stay smooth with ~500 nodes (memoized node components, only visible elements rendered).
- Keep "Árvore" and "Linha do tempo" as other views; view choice in the URL query.
- Modo apresentação keeps working on the canvas (bigger cards/fonts).

## Done criteria
cd web && pnpm lint && pnpm build && run its tests; cd vibelog && pnpm lint && pnpm build && pnpm test — all passing, plus the dev-server route check from item 1. At the end, in Brazilian Portuguese: what changed per item (file paths), new dependencies, and anything the product owner should validate.
