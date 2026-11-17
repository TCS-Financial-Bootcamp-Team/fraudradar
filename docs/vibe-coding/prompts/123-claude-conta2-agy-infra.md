---
id: 123
area: infra
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, gemini-4-hydrogen-high)
pai: 120
data: 2026-11-17
---

# Delegação ao agy: volume do cache, restart do banco, senha do worker-serve, CI e README

Prompt enviado, na íntegra, numa worktree da `main` (branch `fix/infra-compose-ci`):

````text
Repository: FraudRadar. Work only in the git worktree at C:\codigo\pessoal\fr-wt-infra (branch `fix/infra-compose-ci`, created from origin/main). Read AGENTS.md first: identifiers in English; documentation and comments in Brazilian Portuguese. Do NOT run git commit, push, merge, reset, checkout, switch, restore, stash or add; leave every change in the working tree for review. Do not start or stop Docker containers. Do not edit docs/vibe-coding/prompts/ (historical records).

## Tasks

1. infra/docker-compose.yml: two PRs left the embedding-model cache declared twice. `hf_cache` (api) and `hf-cache` (api and worker) are both mounted at /root/.cache/huggingface.
   - Keep only `hf_cache`, the name already in use on the Oracle server: the api and the worker mount `hf_cache:/root/.cache/huggingface`, and the top-level `volumes:` declares `hf_cache` and `pgdata` once each.
   - Keep the PT-BR comments, with the new name.
   - Update the mention in rag/README.md (line ~37) and anywhere else outside docs/vibe-coding/prompts/ that says `hf-cache`. If you touch `.agents/skills/fraudradar-overview/SKILL.md`, make the same change in `.claude/skills/fraudradar-overview/SKILL.md`; tests/test_agent_skill.py requires them to be identical.
2. infra/docker-compose.yml: `worker-serve` has `restart: unless-stopped`, but `db` has no restart policy. After Docker restarts, the worker comes back alone and crash-loops ("banco indisponível"). Add `restart: unless-stopped` to `db`.
3. infra/docker-compose.prod.yml: `worker-serve` is not overridden, so in production it connects with the default password (`${POSTGRES_PASSWORD:-fraudradar}`) while the database uses FRAUDRADAR_DB_PASSWORD.
   - Add a `worker-serve` block with the same DATABASE_URL as `api` and `worker` (FRAUDRADAR_DB_PASSWORD, required) and `restart: unless-stopped`, in the file's existing comment style (PT-BR).
   - Check that with FRAUDRADAR_DB_PASSWORD=EXEMPLO set in the environment, `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config` shows EXEMPLO in every service's DATABASE_URL.
   - Check that `docker compose -f infra/docker-compose.yml config --quiet` passes.
   - Both commands only render the configuration; they start nothing.
4. .github/workflows/ci.yml:
   - the web job runs lint and build but not the web tests; add `pnpm test` after `pnpm lint`;
   - in the terraform job, also check the formatting of infra/terraform-oci (`terraform fmt -check -recursive` for that folder), without init or validate.
5. README.md: fix the outdated statements.
   - The `/ingestion/connections` row says the list is empty and that create/sync answer 501. Read api/routes/ingestion.py and describe what those routes do now, in one table row in the same style.
   - In "Atualizar um banco que já existia", add db/upgrades/008_legacy_ingestion_sources.sql, in the same format as 006 and 007: the command, and one sentence on what it does (accepts the old ingestion source `manual`; it needs `public.datasets`, so it runs after 006/007).
   - Do NOT edit the rows about `/alerts/{id}/assessment` and `/alerts/{id}/chat`; another PR changes them.
6. Delete web/src/features/alerts/components/replay-controls.tsx. Nothing imports it (the dashboard uses WeekPicker); confirm with a search before deleting.

## Verify (report each result)
- `cd web && CI=true pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build`
- `uv run --group dev pytest tests/test_agent_skill.py tests/test_dockerfiles.py -q`
- `terraform -chdir=infra/terraform-oci fmt -check -recursive` and `terraform -chdir=infra/terraform fmt -check -recursive`
- the two `docker compose ... config` checks of task 3

## Final report (in English)
Files changed, each verification command with its result, and anything not done.
````

Resultado: `124-agy-infra-result.md`.
