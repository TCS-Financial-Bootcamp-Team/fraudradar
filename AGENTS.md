# AGENTS.md

FraudRadar PLD: monitoramento antilavagem sobre o SAML-D. Projeto de bootcamp,
5 pessoas. Docs e comentários em PT-BR; conceitos de domínio com nomes em
português (tabelas, endpoints, pacotes).

## Layout

- `src/fraudradar/` — pacote compartilhado (`dados`, `features`, `modelo`, `ia`, `config.py`, `banco.py`)
- `api/` — FastAPI (`main.py`, `rotas/`, `repositorios/`, `schemas/`). Leia `api/AGENTS.md` antes de mexer na API.
- `worker/` — CLI em lote (`python -m worker lote --semana AAAA-MM-DD | replay`)
- `web/` — Next.js; `src/features/<modulo>/{components,hooks,services,schemas}` (componente → hook → service → API; componente não faz fetch). Leia `web/AGENTS.md` antes de mexer no Next.
- `db/init/` — SQL que roda na criação do volume; `db/regras/` — regras de cenário
- `infra/` — `docker-compose.yml` (incluído por `compose.yaml` na raiz) e `terraform/`

## Comandos

```bash
uv sync --all-groups
uv run ruff check . && uv run ruff format --check . && uv run pytest
cd web && pnpm lint && pnpm build
docker compose up -d --build db api web
docker compose run --rm worker replay
```

## Regras invioláveis

- Features e score vivem **só** em `src/fraudradar`. Nunca em `api/`, `worker/` ou notebooks.
- O modelo nunca lê `avaliacao` nem as colunas `Is_laundering`/`Laundering_type`.
- O LLM nunca recebe números de conta (pseudonimize antes do prompt). Chave do LLM só na API.
- Dependências pesadas (torch, lightgbm) ficam nos grupos `ml`/`ia`; a imagem da API usa só `api`.
- Nunca leia o `SAML-D.csv` inteiro para inspecionar (1 GB): use `head` ou `nrows`.
- Mudança de esquema: edite `db/init/002_tabelas.sql` e avise o time (exige `docker compose down -v`).
