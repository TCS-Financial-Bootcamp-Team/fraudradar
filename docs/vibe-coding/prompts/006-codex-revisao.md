---
id: 006
autor: Claude Code
destino: Codex (revisor)
pai: 004
data: 2026-10-26
area: frontend
modelo: gpt-6.1-sol / reasoning high
---

You are a strict senior reviewer. READ-ONLY: do not modify any file. Review the uncommitted work on branch feat/frontend-base in C:\codigo\pessoal\fraudradar (see `git status`): the Next.js app in `web/` (auth with Supabase SSR + proxy.ts, app shell, dashboard, alertas, comunicacoes, monitoramento, ingestao CSV/conexao/manual, AI assistant) and the new `vibelog/` app (read-only viewer + CLI `scripts/vibelog.ts` using SUPABASE_SECRET_KEY with session importers and secret redaction). Read `AGENTS.md`, `web/AGENTS.md`, `vibelog/AGENTS.md` first. Ignore node_modules, .pnpm-store, .next.

Focus, in this order:
1. Security: secret key ever reachable from the browser bundle or a client component; connection strings echoed back/logged/stored in the browser; open redirect in auth/callback or login `?next=`; proxy.ts gaps (routes left unprotected, API routes, static matcher); redaction in vibelog importers missing patterns (sbp_, sb_secret_, sk-, JWT, postgres URLs with password, Authorization headers); XSS in markdown rendering of untrusted transcript content.
2. Correctness: broken flows (login/cadastro/recuperar-senha/callback), hooks with stale state or missing error handling, zod schemas that include Is_laundering/Laundering_type (forbidden), CSV parsing that loads whole huge files, importer idempotency/parent linking bugs, tree filtering that drops ancestors.
3. Project rules violations (components fetching directly, alert(), feature/score logic in the front, non PT-BR UI).
Skip style nitpicks. For each finding output: severity (critica/alta/media/baixa), file:line, the concrete failure scenario, and the minimal fix. End with a short verdict. Write the answer in Brazilian Portuguese.
