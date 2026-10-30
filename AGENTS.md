# AGENTS.md

FraudRadar PLD: monitoramento antilavagem sobre o SAML-D. Projeto de bootcamp,
5 pessoas. Código em inglês: identificadores, arquivos, pastas, tabelas e
colunas, valores gravados, rotas, campos JSON, variáveis de ambiente e comandos.
Em PT-BR: textos de tela, documentação, comentários e mensagens de log e de
erro. O mapa entre os termos do time e os nomes do código está em
docs/glossary.md; nome novo segue o glossário.

## Layout

- `src/fraudradar/` — pacote compartilhado (`data`, `features`, `model`, `ai`, `config.py`, `db.py`)
- `api/` — FastAPI (`main.py`, `routes/`, `repositories/`, `schemas/`). Leia `api/AGENTS.md` antes de mexer na API.
- `worker/` — CLI em lote (`python -m worker batch --week AAAA-MM-DD | replay`)
- `web/` — Next.js; `src/features/<modulo>/{components,hooks,services,schemas}` (componente → hook → service → API; componente não faz fetch). Leia `web/AGENTS.md` antes de mexer no Next.
- `db/init/` — SQL que roda na criação do volume; `db/rules/` — regras de cenário
- `lab/` — rascunho da equipe, fora do git (só o README e o notebook `FraudRadar_LSTM.ipynb` são versionados). Nada importa de lá; não trate o conteúdo como fonte de verdade.
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
- O modelo nunca lê `ground_truth` nem as colunas `Is_laundering`/`Laundering_type`.
- O LLM nunca recebe números de conta (pseudonimize antes do prompt). Chave do LLM só na API.
- Dependências pesadas (torch, lightgbm) ficam nos grupos `ml`/`ai`; a imagem da API usa só `api`.
- Nunca leia o `SAML-D.csv` inteiro para inspecionar (1 GB): use `head` ou `nrows`.
- Mudança de esquema: edite `db/init/002_tables.sql` e avise o time (exige `docker compose down -v`).
