# FraudRadar PLD

Projeto final do bootcamp: monitoramento antilavagem de dinheiro (PLD) sobre o
dataset sintético **SAML-D**.

Plano: https://claude.ai/artifact/WBpQHzLCN1yH53pmPGrddG#ac555d39-8243.mqrep4fzzfj.11098

## O que o sistema faz

1. Um **worker em lote semanal** dá score às transações com **LightGBM** e monta
   a **fila de alertas por conta**, com as evidências (contribuição das
   features, regras de cenário, sinais semanais, grafo de 2 saltos).
2. Um **LLM com RAG** (pgvector, sobre a Lei 9.613/1998, a Circular BCB
   3.978/2020, as tipologias do SAML-D e o manual interno) redige o
   **parecer** do alerta.
3. O **analista** lê o parecer e decide: arquivar, aprofundar ou comunicar ao
   **COAF** (com justificativa obrigatória e o próprio nome registrado).

Não há tempo real: o lote roda por semana, e um modo *replay* avança a demo uma
semana por vez.

## Stack

| Camada | Tecnologia |
|---|---|
| Python | 3.12 fixo, **uv** (um `pyproject.toml` na raiz, `uv.lock` versionado) |
| Pacote compartilhado | `src/fraudradar` — importado por notebooks, API e worker |
| API | FastAPI + Pydantic (única porta do front; guarda a chave do LLM) |
| Worker | processo Python em lote (semana + replay) |
| Banco | Postgres 17 + pgvector (Docker, `pgvector/pgvector:pg17`) |
| Front | Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, pnpm; Cytoscape.js e Recharts |
| Infra | Docker Compose + Terraform (provider `kreuzwerker/docker`), sem nuvem |
| CI | GitHub Actions: lint e testes a cada push |

Login pelo Supabase Auth: o nome do analista logado fica gravado em cada decisão.

## Estrutura

```
fraudradar/
├── data/                # SAML-D.csv (fora do git) — ver data/README.md
├── notebooks/           # 01_tratamento, 02_eda, 03_modelo, 04_avaliacao_llm
├── lab/                 # rascunho da equipe: gráficos e testes de modelo (fora do git)
├── src/fraudradar/      # pacote compartilhado
│   ├── config.py        # configurações lidas do .env
│   ├── db.py            # conexão com o Postgres
│   ├── data/            # carga, dtypes, limpeza das tipologias
│   ├── features/        # histórico da conta, sinais semanais, grafo
│   ├── model/           # treino, score, fila, explicação
│   └── ai/              # RAG, cadeia do parecer, validador, agente
├── api/                 # FastAPI: rotas e schemas
├── worker/              # lote semanal e replay
├── web/                 # Next.js
├── db/                  # init/ (extensões e tabelas) e rules/ (cenários SQL)
├── rag/                 # textos da lei, circular e manual interno
├── models/              # modelos treinados (fora do git)
├── infra/               # docker-compose.yml e terraform/
├── docs/                # BPMN, PDF, slides
├── tests/
└── .github/workflows/
```

## Como rodar

Pré-requisitos: Docker (com Compose 2.24+), [uv](https://docs.astral.sh/uv/),
Node 24 e pnpm 10. Terraform é opcional.

```bash
cp .env.example .env            # preencha a chave do LLM se for usar
uv sync --all-groups            # cria .venv com Python 3.12 e todas as dependências
docker compose up -d --build    # sobe db, api e web
```

- Front: http://localhost:3000
- API (Swagger): http://localhost:8000/docs
- Saúde: http://localhost:8000/health

Outros comandos:

```bash
uv run pytest                               # testes; os da API usam o Postgres do Compose
uv run ruff check . && uv run ruff format .  # lint e formatação
docker compose run --rm worker replay       # roda o worker (job em lote)
docker compose run --rm worker batch --week 2023-01-02
cd web && pnpm install && pnpm dev          # front em modo dev (com a API rodando)
docker compose down                         # para tudo (o volume do banco fica)
docker compose down -v                      # para e APAGA o banco (re-roda db/init)
```

As tabelas são criadas por `db/init/*.sql` só na **primeira** subida do volume.
Mudou o SQL? `docker compose down -v` e suba de novo.

Os testes da API criam e apagam o banco `fraudradar_test` no Postgres do
Compose (`docker compose up -d db`); sem ele, são pulados. Outro servidor:
`TEST_DATABASE_URL` (o nome do banco precisa terminar em `_test`).

## API

Swagger em http://localhost:8000/docs. Toda rota, menos `/health`, exige o access
token do Supabase Auth (`Authorization: Bearer ...`), validado pela chave
pública do projeto; o nome do perfil do analista vai para decisões, aprovações
e auditoria. Em desenvolvimento, `AUTH_DISABLED=true` dispensa o login.

| Rota | O que faz |
|---|---|
| `GET /weeks` | semanas já liberadas pelo replay (`current` é a mais recente) |
| `POST /replay/next-week` | libera a próxima semana já processada pelo worker |
| `GET /alerts?week=` | fila paginada da semana (filtros `status` e `country`) |
| `GET /alerts/{id}` | detalhe: contribuições, regras, movimentações e último parecer |
| `GET /alerts/{id}/graph` | vizinhança de 2 saltos da conta na semana |
| `POST /alerts/{id}/decision` | arquivar, aprofundar ou comunicar, com justificativa |
| `GET /alerts/{id}/report` | rascunho da comunicação ao COAF |
| `POST /alerts/{id}/report/approve` | aprova a comunicação e encerra o alerta |
| `GET /monitoring?week=` | indicadores e séries da semana |
| `POST /alerts/{id}/assessment`, `/chat` | ainda respondem 503: dependem do RAG (frente 3) |
| `POST /ingestion/csv` | CSV do SAML-D sem as colunas de avaliação; tudo ou nada (abaixo) |
| `POST /ingestion/transactions` | uma transação no mesmo formato, em JSON |
| `/ingestion/connections` | fontes Postgres externas: lista vazia; cadastro e sincronização respondem 501 |

A API não roda o modelo: ela lê o que o worker grava, e o replay só libera
semanas que o worker já processou (`weekly_batches`). Os formatos JSON que o
worker grava (evidências e métricas da semana) estão comentados em
`db/init/002_tables.sql`.

### Ingestão

O CSV vai em `multipart/form-data`, campo `file`: UTF-8, separado por
vírgula, com as 10 colunas de transação do SAML-D no cabeçalho, em qualquer
ordem, e sem `Is_laundering`/`Laundering_type` (rótulo não entra pela API).
Todas as linhas são validadas (`src/fraudradar/data/ingestion.py`): uma linha
com erro recusa o arquivo inteiro, e o 422 lista os 20 primeiros erros com linha
e coluna. Contas: só dígitos, sem zero à esquerda, até 9223372036854775807
(`BIGINT`).

**Limite por envio: 20 MiB e 200 mil linhas** (`INGESTION_MAX_BYTES`,
`INGESTION_MAX_ROWS`); acima disso, 413. O envio roda numa transação só, com
o `statement_timeout` de 15 s: 200 mil linhas levaram de 1,6 a 2,8 s pela API,
com o COPY em 1,9 s numa tabela de 11 milhões de linhas. Para o SAML-D inteiro,
use o worker, não a API.

Cada envio vira um registro em `ingestions`, cujo id é o do recibo, com status
`received`: o score sai quando o worker processa a semana das transações.

Terraform (alternativa ao Compose, mesmos containers com prefixo
`fraudradar-tf`; não rode os dois juntos, as portas colidem):

```bash
cd infra/terraform
terraform init
terraform apply -var 'docker_host=npipe:////./pipe/docker_engine'   # Windows
```

## Quem cuida de quê

| Frente | Responsável por |
|---|---|
| 1 Dados e SQL | `notebooks/01_tratamento`, `notebooks/02_eda`, `db/`, `src/fraudradar/data` |
| 2 Modelo | `src/fraudradar/model`, `src/fraudradar/features`, `notebooks/03_modelo` |
| 3 IA generativa | `src/fraudradar/ai`, `rag/`, `notebooks/04_avaliacao_llm` |
| 4 API e front | `api/`, `worker/`, `web/` |
| 5 Processo e entrega | `infra/`, `docs/`, CI |

## Regras do time

- Features e score existem **só** em `src/fraudradar`. API, worker e notebooks
  importam; não reimplementam.
- O modelo nunca lê a tabela `ground_truth` (rótulo e tipologia).
- O LLM **nunca** recebe números de conta.
- Nada de dados, modelos ou `.env` no git.
