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
├── dados/               # SAML-D.csv (fora do git) — ver dados/README.md
├── notebooks/           # 01_tratamento, 02_eda, 03_modelo, 04_avaliacao_llm
├── laboratorio/         # rascunho da equipe: gráficos e testes de modelo (fora do git)
├── src/fraudradar/      # pacote compartilhado
│   ├── config.py        # configurações lidas do .env
│   ├── banco.py         # conexão com o Postgres
│   ├── dados/           # carga, dtypes, limpeza das tipologias
│   ├── features/        # histórico da conta, sinais semanais, grafo
│   ├── modelo/          # treino, score, fila, explicação
│   └── ia/              # RAG, cadeia do parecer, validador, agente
├── api/                 # FastAPI: rotas e schemas
├── worker/              # lote semanal e replay
├── web/                 # Next.js
├── db/                  # init/ (extensões e tabelas) e regras/ (cenários SQL)
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
- Saúde: http://localhost:8000/saude

Outros comandos:

```bash
uv run pytest                               # testes; os da API usam o Postgres do Compose
uv run ruff check . && uv run ruff format .  # lint e formatação
docker compose run --rm worker replay       # roda o worker (job em lote)
docker compose run --rm worker lote --semana 2023-01-02
cd web && pnpm install && pnpm dev          # front em modo dev (com a API rodando)
docker compose down                         # para tudo (o volume do banco fica)
docker compose down -v                      # para e APAGA o banco (re-roda db/init)
```

As tabelas são criadas por `db/init/*.sql` só na **primeira** subida do volume.
Mudou o SQL? `docker compose down -v` e suba de novo.

Os testes da API criam e apagam o banco `fraudradar_teste` no Postgres do
Compose (`docker compose up -d db`); sem ele, são pulados. Outro servidor:
`TEST_DATABASE_URL` (o nome do banco precisa terminar em `_teste`).

## API

Swagger em http://localhost:8000/docs. Toda rota, menos `/saude`, exige o access
token do Supabase Auth (`Authorization: Bearer ...`), validado pela chave
pública do projeto; o nome do perfil do analista vai para decisões, aprovações
e auditoria. Em desenvolvimento, `AUTH_DESLIGADA=true` dispensa o login.

| Rota | O que faz |
|---|---|
| `GET /semanas` | semanas já liberadas pelo replay (`atual` é a mais recente) |
| `POST /replay/proxima-semana` | libera a próxima semana já processada pelo worker |
| `GET /alertas?semana=` | fila paginada da semana (filtros `status` e `pais`) |
| `GET /alertas/{id}` | detalhe: contribuições, regras, movimentações e último parecer |
| `GET /alertas/{id}/grafo` | vizinhança de 2 saltos da conta na semana |
| `POST /alertas/{id}/decisao` | arquivar, aprofundar ou comunicar, com justificativa |
| `GET /alertas/{id}/comunicacao` | rascunho da comunicação ao COAF |
| `POST /alertas/{id}/comunicacao/aprovar` | aprova a comunicação e encerra o alerta |
| `GET /monitoramento?semana=` | indicadores e séries da semana |
| `POST /alertas/{id}/parecer`, `/chat` | ainda respondem 503: dependem do RAG (frente 3) |
| `/ingestao/*` | ainda responde 501 |

A API não roda o modelo: ela lê o que o worker grava, e o replay só libera
semanas que o worker já processou (`lotes_semana`). Os formatos JSON que o
worker grava (evidências e métricas da semana) estão comentados em
`db/init/002_tabelas.sql`.

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
| 1 Dados e SQL | `notebooks/01_tratamento`, `notebooks/02_eda`, `db/`, `src/fraudradar/dados` |
| 2 Modelo | `src/fraudradar/modelo`, `src/fraudradar/features`, `notebooks/03_modelo` |
| 3 IA generativa | `src/fraudradar/ia`, `rag/`, `notebooks/04_avaliacao_llm` |
| 4 API e front | `api/`, `worker/`, `web/` |
| 5 Processo e entrega | `infra/`, `docs/`, CI |

## Regras do time

- Features e score existem **só** em `src/fraudradar`. API, worker e notebooks
  importam; não reimplementam.
- O modelo nunca lê a tabela `avaliacao` (rótulo e tipologia).
- O LLM **nunca** recebe números de conta.
- Nada de dados, modelos ou `.env` no git.
