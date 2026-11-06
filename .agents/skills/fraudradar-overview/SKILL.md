---
name: fraudradar-overview
description: Explicação completa do FraudRadar PLD — o que o sistema faz, o fluxo de ponta a ponta, o domínio (PLD, COAF, tipologias), o dataset SAML-D, a arquitetura, cada pasta do repositório, as tabelas do banco, as rotas da API, as telas do front, a infraestrutura, as variáveis de ambiente, os testes, as frentes do time e o que já está pronto. Use quando precisar entender o projeto, achar onde algo mora, planejar uma mudança que cruza mais de uma parte ou explicar o projeto para alguém. As regras de trabalho (commits, lab/, registro de prompts) ficam na skill fraudradar.
---

# FraudRadar PLD: o projeto inteiro

Mapa do projeto para qualquer IA ou pessoa do time. As **regras de trabalho**
(idioma, commits, `lab/`, registro de prompts) estão na skill `fraudradar`; leia as
duas. Esta skill descreve; quando divergir do código, vale o código e o arquivo
citado.

Cópias: `.agents/skills/fraudradar-overview/SKILL.md` (original) e
`.claude/skills/fraudradar-overview/SKILL.md`. O `tests/test_agent_skill.py` falha
se forem diferentes.

## 1. O que é

Projeto final de um bootcamp, feito por 5 pessoas: um sistema de **monitoramento
antilavagem de dinheiro** (PLD, prevenção à lavagem de dinheiro) sobre o
**SAML-D**, um dataset sintético de transações bancárias com o gabarito de quais são
lavagem.

O sistema imita o trabalho de um setor de PLD de banco:

1. Uma vez por semana, um **lote** dá um **score** de suspeita a cada conta com
   movimento e monta uma **fila de alertas** por conta, da mais suspeita para a
   menos suspeita.
2. Para cada alerta, um **LLM com RAG** (busca em textos da lei, da circular do
   Banco Central, das tipologias e do manual interno) redige um **parecer**, citando
   as fontes.
3. O **analista** (pessoa) lê o alerta, as evidências e o parecer, e decide:
   **arquivar**, **aprofundar** ou **comunicar ao COAF**. A justificativa é
   obrigatória e o nome do analista fica gravado.
4. Comunicar gera um **rascunho de comunicação** ao COAF, que precisa ser
   **aprovado**; aprovado, o alerta se encerra. Toda ação vai para a **auditoria**.

Não há tempo real. O modo **replay** libera uma semana por vez, para a demonstração
avançar no tempo.

O que o bootcamp exige (`docs/project-requirements.md`): README, slides (até 20 min),
documento das etapas, BPMN do processo; ML treinado **ou** IA de terceiros com base de
conhecimento (o projeto faz os dois); back e front; banco; infraestrutura com
Terraform; e os prompts do vibe-coding (`docs/vibe-coding/prompts/`).

Plano original: link no topo do `README.md`.

## 2. O fluxo de ponta a ponta

```
data/SAML-D.csv ──carga (COPY)──► transactions + ground_truth (gabarito, separado)
POST /ingestion/* ──────────────► transactions (status do envio em ingestions)
                                        │
             worker batch --week ◄──────┘  (uma semana por vez)
               ├─ features (src/fraudradar/features)
               ├─ score LightGBM (src/fraudradar/model) ─► transaction_scores
               ├─ fila por conta ─────────────────────────► alerts
               ├─ SHAP, regras SQL, sinais, grafo ────────► evidence
               ├─ parecer RAG + LLM (src/fraudradar/ai) ──► assessments
               └─ métricas contra ground_truth ───────────► weekly_batches
                                        │
     POST /replay/next-week ── libera a semana (weekly_batches.released_at)
                                        │
             API (FastAPI, só lê e grava decisões) ◄──► web (Next.js) ◄── analista
                                        │
                      decisions ─► reports (rascunho → aprovada) ─► audit_log
```

Pontos que confundem quem chega:

- A **API não roda o modelo**. A imagem dela nem tem lightgbm. Quem calcula é o
  worker; a API só lê o que ele gravou e grava as decisões do analista.
- A unidade da fila é a **conta na semana** (`alerts` tem `UNIQUE (account, week)`),
  não a transação. O score de transação existe (`transaction_scores`), mas o analista
  vê contas.
- `week` é sempre a **segunda-feira** da semana (o banco tem `CHECK`).
- O modelo **nunca** lê `ground_truth`. Só o worker lê, e só para calcular as
  métricas de monitoramento (recall, acerto de tipologia).
- O LLM **nunca** recebe número de conta: a conta é pseudonimizada antes do prompt.

## 3. Domínio em poucas linhas

| Termo | O que é |
|---|---|
| PLD | Prevenção à lavagem de dinheiro (em inglês, AML) |
| COAF | Conselho de Controle de Atividades Financeiras, que recebe as comunicações de operação suspeita |
| Lei 9.613/1998 | Lei de lavagem de dinheiro |
| Circular BCB 3.978/2020 | Regras do Banco Central para política e controles de PLD |
| Tipologia | Padrão de lavagem (fan-out, estruturação, ciclo...) |
| Fila / alerta | Conta suspeita numa semana, com posição na fila |
| Evidência | Por que a conta foi sinalizada: contribuição das features (SHAP), regras que dispararam, sinais da semana, grafo de 2 saltos |
| Parecer | Texto do LLM explicando o alerta, com fontes citadas |
| Decisão | Arquivar, aprofundar ou comunicar, com justificativa |
| Comunicação | Rascunho para o COAF, aprovado por um analista |
| Replay | Liberar a próxima semana já processada, para a demo |
| Gabarito | `ground_truth`: rótulo e tipologia verdadeiros do SAML-D |

Tradução de cada termo para o nome usado no código: `docs/glossary.md`.

## 4. O dataset SAML-D

- `data/SAML-D.csv`, cerca de 1 GB e 9,5 milhões de transações, de 07/10/2022 a
  23/08/2023 (cerca de 46 semanas). Fora do git; baixe pelo Kaggle (`data/README.md`).
- 12 colunas: `Time`, `Date`, `Sender_account`, `Receiver_account`, `Amount`,
  `Payment_currency`, `Received_currency`, `Sender_bank_location`,
  `Receiver_bank_location`, `Payment_type`, `Is_laundering`, `Laundering_type`.
- 28 tipologias: 11 normais (`Normal_*`) e 17 suspeitas. As duas últimas colunas são o
  gabarito e nunca entram no modelo.
- `Amount` está em libras (GBP), qualquer que seja `Payment_currency`. O motivo está em
  `src/fraudradar/data/schema.py`.
- Contas têm até 10 dígitos (`BIGINT` no banco, `int64` no pandas).
- Dtypes compactos para ler com pandas: `CSV_DTYPES` em `schema.py`. Nunca leia o
  arquivo inteiro só para olhar; use `nrows` ou um parquet.

## 5. Stack

| Camada | Tecnologia |
|---|---|
| Python | 3.12, `uv`, um `pyproject.toml` na raiz com grupos `api`, `ml`, `ai`, `dev` |
| Pacote compartilhado | `src/fraudradar`, importado por API, worker e notebooks |
| API | FastAPI + Pydantic, SQLAlchemy Core com `text()` (sem ORM) |
| Worker | CLI Python em lote |
| Modelo | LightGBM, com explicação por SHAP (`pred_contrib`) |
| IA | LangChain, OpenAI ou Anthropic, embeddings `intfloat/multilingual-e5-small` (384 dim.) |
| Banco | Postgres 17 + pgvector (`pgvector/pgvector:pg17`) |
| Front | Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, Base UI, zod, react-hook-form, Cytoscape.js, Recharts, pnpm |
| Login | Supabase Auth; a API valida o token pela chave pública (JWKS) |
| Infra | Docker Compose e Terraform (provider `kreuzwerker/docker`), local, sem nuvem |
| CI | GitHub Actions: Python, web e Terraform a cada push e PR |

## 6. Estrutura de pastas

```
fraudradar/
├── AGENTS.md, CLAUDE.md     regras para IAs (CLAUDE.md só inclui o AGENTS.md)
├── CONTRIBUTING.md          commits, branches, PR, registro de prompts
├── README.md                visão geral, como rodar, rotas da API
├── pyproject.toml, uv.lock  dependências Python e configuração do ruff/pytest
├── compose.yaml             inclui infra/docker-compose.yml
├── .env.example             variáveis de ambiente (copie para .env)
├── .agents/skills/          skills das IAs (original); cópia em .claude/skills/
├── .github/workflows/ci.yml CI
│
├── src/fraudradar/          PACOTE COMPARTILHADO: a lógica de dados, features, modelo e IA
│   ├── config.py            configurações lidas do .env (get_settings, ROOT_DIR)
│   ├── db.py                conexão com o Postgres
│   ├── data/                schema.py (colunas, dtypes, moeda), ingestion.py (validação
│   │                        de transação que entra, igual para API e worker)
│   ├── features/            features da conta: histórico, sinais da semana, grafo
│   ├── model/               treino, score, fila, explicação (SHAP)
│   └── ai/                  RAG, cadeia do parecer, validador, assistente
│
├── api/                     FASTAPI (leia api/AGENTS.md)
│   ├── main.py              app, CORS, routers; todos exigem login menos /health
│   ├── dependencies.py      DbConnection (uma transação por requisição), CurrentUser
│   ├── domain.py            tradução banco ↔ front (status, score 0–100)
│   ├── routes/              rotas finas: alerts, decisions, weeks, replay,
│   │                        monitoring, ingestion, ai, health
│   ├── repositories/        SQL de cada recurso
│   └── schemas/             Pydantic, espelho do zod do front
│
├── worker/                  CLI em lote: python -m worker load | batch --week AAAA-MM-DD |
│                            backfill | replay (README, seção Worker)
├── db/
│   ├── init/                001_extensions.sql, 002_tables.sql (o esquema inteiro, comentado)
│   └── rules/               regras de cenário em SQL (NNN_rule_name.sql), uma por arquivo
├── rag/                     textos da base do RAG (lei, circular, tipologias, manual)
├── data/                    SAML-D.csv e derivados, fora do git
├── models/                  modelos treinados, fora do git
├── notebooks/               notebooks oficiais: 01_tratamento, 02_eda, 03_modelo,
│                            04_avaliacao_llm (importam de src/, nunca o contrário)
├── lab/                     rascunho da equipe, fora do git; uma subpasta por pessoa
├── tests/                   pytest: tests/api/ contra Postgres de verdade, e o resto
│
├── web/                     NEXT.JS (leia web/AGENTS.md e web/API_CONTRACTS.md)
│   ├── src/app/(auth)/      login, signup, reset-password
│   ├── src/app/(app)/       telas logadas (layout com a barra lateral)
│   ├── src/features/<m>/    components → hooks → services → API, e schemas (zod)
│   ├── src/components/      shell, layout/ (sidebar, header, menu da conta), ui/
│   ├── src/lib/             api.ts (cliente e USE_MOCKS), format.ts, supabase/, sidebar.ts
│   └── tests/               node:test: contratos, fluxos com mock, API real, sidebar
│
├── vibelog/                 APP À PARTE: árvore dos prompts do vibe-coding (leia vibelog/AGENTS.md)
├── infra/
│   ├── docker-compose.yml   serviços db, api, web e worker
│   └── terraform/           os mesmos containers via Terraform
├── docs/
│   ├── glossary.md          português do time → nomes do código
│   ├── project-requirements.md  o que o bootcamp exige
│   └── vibe-coding/prompts/ registro de cada prompt (NNN-autor-assunto.md)
└── trash/                   descartáveis locais, fora do git
```

## 7. Banco (`db/init/002_tables.sql`)

O esquema roda só na criação do volume. Mudou o SQL? `docker compose down -v`.

| Tabela | Quem grava | O que guarda |
|---|---|---|
| `transactions` | carga e API de ingestão | as transações (10 colunas do SAML-D, sem gabarito) |
| `ingestions` | API | um registro por envio: `received` → `processing` → `completed` |
| `ground_truth` | carga | rótulo e tipologia verdadeiros; o modelo nunca lê |
| `accounts` | carga / worker | contas derivadas das transações |
| `model_versions` | worker | versões do modelo: features, limiar, métricas; só uma `active` |
| `transaction_scores` | worker | score de cada transação |
| `weekly_batches` | worker; API marca `released_at` | uma linha por semana processada, com as métricas contra o gabarito |
| `alerts` | worker; API muda `status` | fila por conta e semana: score, posição, países, tipologia prevista, totais |
| `evidence` | worker | contribuições SHAP, regras, sinais semanais, grafo |
| `assessments` | worker ou API | parecer do LLM, com fontes e validação |
| `decisions` | API | arquivar, aprofundar ou comunicar, com analista e justificativa |
| `reports` | API | rascunho da comunicação ao COAF e aprovação |
| `rag_documents` | carga do RAG | trechos dos textos com embedding (pgvector, HNSW) |
| `audit_log` | API | quem fez o quê e quando |

Status do alerta no banco: `new`, `in_review`, `archived`, `escalated`, `reported`. O
front mostra `pending` (`new` e `in_review`), `escalated`, `archived` e `reported`.
O formato dos JSON que o worker grava está comentado no próprio SQL; a versão completa
(com `weekly_signals` e as chaves novas de `metrics`) está no README, seção Worker.

## 8. API

Swagger em http://localhost:8000/docs. Todas as rotas, menos `/health`, exigem o
token do Supabase (`Authorization: Bearer ...`); em desenvolvimento,
`AUTH_DISABLED=true` dispensa.

| Rota | O que faz |
|---|---|
| `GET /health` | saúde: banco, modelo e LLM (`ok` ou `degraded`); sem login |
| `GET /weeks` | semanas liberadas pelo replay |
| `POST /replay/next-week` | libera a próxima semana já processada |
| `GET /alerts?week=` | fila paginada, filtros `status` e `country` |
| `GET /alerts/{id}` | detalhe: contribuições, regras, movimentações, último parecer |
| `GET /alerts/{id}/graph` | vizinhança de 2 saltos da conta na semana |
| `POST /alerts/{id}/decision` | arquivar, aprofundar ou comunicar |
| `GET /alerts/{id}/report` | rascunho da comunicação |
| `POST /alerts/{id}/report/approve` | aprova a comunicação e encerra o alerta |
| `GET /monitoring?week=` | indicadores e séries da semana |
| `POST /alerts/{id}/assessment`, `/chat` | parecer e chat da IA |
| `POST /ingestion/csv`, `/ingestion/transactions` | entrada de transações, tudo ou nada |
| `/ingestion/connections` | fontes Postgres externas |

Detalhes (limites, códigos de erro, padrões de código): `README.md` e `api/AGENTS.md`.

## 9. Front (`web/`)

| Tela | Rota | Feature |
|---|---|---|
| Visão geral | `/dashboard` | `features/alerts` |
| Fila de alertas e detalhe | `/alerts`, `/alerts/[id]` | `features/alerts` |
| Comunicações | `/reports` | `features/alerts` |
| Monitoramento | `/monitoring` | `features/alerts` |
| Fontes de dados | `/ingestion` | `features/ingestion` |
| Configurações | `/settings` | `features/settings` |
| Login, cadastro, nova senha | `/login`, `/signup`, `/reset-password` | `features/auth` |
| Assistente (botão flutuante) | todas as telas logadas | `features/assistant` |

- Camadas: componente → hook → service → API. Componente não faz fetch. Os schemas
  zod de cada feature são o contrato com a API (`web/API_CONTRACTS.md`).
- `NEXT_PUBLIC_USE_MOCKS=true` troca a API por dados simulados (faixa "Ambiente
  demonstrativo" no topo). Com `false`, o front lê o banco que o worker preparou
  (`load` e `backfill`) e as semanas que o replay liberou.
- Next 16 tem mudanças de API: leia `web/node_modules/next/dist/docs/` antes de usar
  algo do Next de que não tenha certeza.

## 10. VibeLog (`vibelog/`)

App Next separado (porta 3001) que mostra a árvore de prompts do projeto: prompt da
pessoa → delegações para outras IAs → resultados, com commits e prints. Os dados ficam
no Supabase do projeto. Só as IAs escrevem, pela CLI (`pnpm vibelog ...`), com a chave
de `vibelog/.env.local`. Sem a chave, o registro em `docs/vibe-coding/prompts/` basta e
é importado depois.

## 11. Rodando

```bash
cp .env.example .env
uv sync --all-groups
docker compose up -d --build              # db :5432, api :8000, web :3000
uv run python -m worker load              # SAML-D no Postgres (uma vez, ~1,5 min)
uv run python -m worker backfill          # as 14 semanas do teste (~1,5 min, ~7 GB)
docker compose run --rm worker replay     # ou pelo Docker (o worker tem profile próprio)
cd web && pnpm install && pnpm dev        # front em modo dev
```

Terraform (`infra/terraform`) sobe os mesmos containers com prefixo `fraudradar-tf`;
não rode junto com o Compose, as portas colidem.

Variáveis (`.env.example`): `POSTGRES_*` e `DATABASE_URL` (banco); `LLM_PROVIDER`,
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `EMBEDDING_MODEL` (IA, só na API e no worker);
`MODEL_DIR`, `MODEL_FILE` (modelo treinado); `CORS_ORIGINS`, `AUTH_DISABLED` (API);
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCKS`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (front).

## 12. Testes e CI

- Python: `uv run ruff check . && uv run ruff format --check . && uv run pytest`.
  `tests/api/` e `tests/worker/` rodam contra Postgres de verdade (fixtures em
  `tests/conftest.py`); use `REQUIRE_TEST_DB=1` e um banco terminado em `_test`, senão os
  testes são pulados sem aviso. Os do modelo e do worker precisam do grupo `ml`
  (`uv run --group api --group ml pytest`).
- Web: `cd web && pnpm lint && pnpm test && pnpm build`.
- CI (`.github/workflows/ci.yml`): job `python` (com Postgres e os grupos `api` e `ml`),
  job `web`, job `terraform` (`fmt` e `validate`).

## 13. Frentes do time

| Frente | Cuida de |
|---|---|
| 1 Dados e SQL | `notebooks/01_tratamento`, `02_eda`, `db/`, `src/fraudradar/data`, carga do SAML-D, regras em `db/rules/` |
| 2 Modelo | `src/fraudradar/features`, `src/fraudradar/model`, `notebooks/03_modelo` |
| 3 IA generativa | `src/fraudradar/ai`, `rag/`, `notebooks/04_avaliacao_llm` |
| 4 API e front | `api/`, `worker/`, `web/` |
| 5 Processo e entrega | `infra/`, `docs/`, CI, BPMN, slides, relatório |

Não implemente a parte de outra frente por iniciativa própria: pergunte a quem pediu a
tarefa.

## 14. Estado em 06/11/2026

Confira com `git log` antes de confiar; isto muda rápido.

- **Pronto**: API (fila, detalhe, grafo, decisões, comunicação, monitoramento, replay,
  ingestão); front (todas as telas, também com dados simulados); esquema do banco;
  Compose, Terraform e CI; VibeLog.
- **Responde de propósito que não existe**: parecer e chat da IA (503, esperando a
  frente 3); cadastro de fontes Postgres (501, pede um desenho de segurança próprio).
- **Modelo (Vinicius, frente 2; na `main` desde o PR #7)**: carga do SAML-D para o treino
  (`src/fraudradar/data/saml_d.py`), 26 variáveis por transação (19 das 21 do modelo vêm do
  histórico das contas; `features/history.py`), LightGBM oficial com fila semanal por conta,
  explicação por contribuição e segmentos K-Means (`model/`), `python -m fraudradar.model
  train | check`. Números e limites em `docs/model.md`. Não prevê a tipologia: ela vem do
  parecer da IA (frente 3).
- **Worker (PR da branch `feat/worker-batch`, registros 062 e 063)**: `python -m worker
  load | batch | backfill | replay`. Carrega o SAML-D no Postgres (ids = linha do CSV + 1) e,
  por semana, grava `transaction_scores`, `alerts` (fila com o corte da ficha, até 300),
  `evidence` (contribuições, regras de `db/rules/`, sinais semanais), `accounts.segment`,
  `model_versions`, `weekly_batches` (métricas contra o gabarito), `ingestions` e
  `audit_log`. Só semanas depois do treino, a não ser com `--allow-in-sample`. No SAML-D
  inteiro, a fila das 14 semanas do teste repete a ficha (recall 95,1%, precisão 99,0%, 2,2
  inocentes por semana) e os 2,76 milhões de scores são os do modelo. Fluxo da demo: `load`,
  `backfill`, e liberar as semanas no app.
- **Vazio**: regras em `db/rules/` (frente 1; o worker já roda o que entrar lá),
  `src/fraudradar/ai` e `rag/` (frente 3; o worker ainda não grava `assessments` nem
  tipologia), os notebooks oficiais.
- **Em exploração**: LSTM e GRU em notebooks do `lab/` (branch `origin/victor` e
  `lab/FraudRadar_LSTM.ipynb`).

## 15. Onde ler mais

`README.md` (visão e comandos) · `AGENTS.md` (regras) · `api/AGENTS.md` ·
`web/AGENTS.md` e `web/API_CONTRACTS.md` · `vibelog/AGENTS.md` ·
`db/init/002_tables.sql` · `docs/glossary.md` · `CONTRIBUTING.md` · `lab/README.md` ·
`docs/vibe-coding/prompts/` (o histórico de decisões, prompt a prompt).
