# FraudRadar PLD

Sistema de **monitoramento antilavagem de dinheiro (PLD)** construído como projeto final do
bootcamp. Ele lê transações bancárias, dá uma nota de risco a cada uma com um modelo de
**Machine Learning** (LightGBM), monta a **fila semanal de alertas por conta** com as evidências
e usa **IA generativa com base de conhecimento** (Gemini + RAG sobre a Lei 9.613/1998) para
redigir o parecer do analista. A decisão final, inclusive a comunicação ao COAF, é sempre de
uma pessoa.

- Front publicado: https://fraudradar-web.vercel.app (login pelo Supabase Auth)
- Etapas do desenvolvimento: [`docs/development-process.md`](docs/development-process.md)
- Processo de negócio (BPMN): [`docs/bpmn/`](docs/bpmn/README.md) · Banco (DER): [`docs/erd/`](docs/erd/README.md)
- Prompts do vibe-coding: [`docs/vibe-coding/prompts/`](docs/vibe-coding/prompts/)

## Sumário

1. [Tema e objetivo](#tema-e-objetivo)
2. [Requisitos do bootcamp](#requisitos-do-bootcamp)
3. [O que o sistema faz](#o-que-o-sistema-faz)
4. [Arquitetura](#arquitetura)
5. [Tecnologias](#tecnologias)
6. [Dados e modelo](#dados-e-modelo)
7. [IA generativa](#ia-generativa)
8. [Estrutura do repositório](#estrutura-do-repositório)
9. [Como rodar](#como-rodar)
10. [Testes e CI](#testes-e-ci)
11. [API](#api)
12. [Worker](#worker)
13. [Documentação](#documentação)
14. [Equipe e regras do time](#equipe-e-regras-do-time)

## Tema e objetivo

Bancos e instituições de pagamento são obrigados a monitorar as transações dos clientes,
identificar operações suspeitas de lavagem de dinheiro e comunicá-las ao **COAF** (Lei
9.613/1998 e Circular BCB 3.978/2020). Na prática, as regras fixas geram alerta demais, a maior
parte falso positivo, e o analista gasta o dia descartando casos inocentes.

O FraudRadar ataca esse gargalo:

- **Priorizar**: uma fila curta por semana, com as contas de maior risco primeiro (no teste,
  95,1% das contas lavadoras entram na fila, com 2,2 inocentes por semana).
- **Explicar**: cada alerta mostra por que entrou: contribuição de cada variável, regras de
  cenário disparadas, sinais da semana e o grafo de contrapartes.
- **Apoiar a decisão**: a IA redige o parecer com citações da lei e sugere a tipologia; o
  analista arquiva, aprofunda ou comunica, com justificativa e o próprio nome registrado.
- **Aprender com o analista**: as decisões viram rótulos que podem entrar no retreino do modelo.

A base é o **SAML-D**, um dataset sintético público de transações (9,5 milhões de linhas, 28
tipologias, com gabarito). Dado sintético porque transação bancária real não pode ser usada.

## Requisitos do bootcamp

Os requisitos estão em [`docs/project-requirements.md`](docs/project-requirements.md). Onde cada
um está atendido:

| Requisito | Onde está |
|---|---|
| README com tema, objetivo, tecnologias e instruções | este arquivo |
| Documento das etapas desenvolvidas | [`docs/development-process.md`](docs/development-process.md) |
| BPMN do processo da regra de negócio | [`docs/bpmn/`](docs/bpmn/README.md): monitoramento de ponta a ponta, processamento do período e retreino |
| Slides da apresentação | entregues à parte (apresentação de até 20 minutos) |
| Machine Learning: aquisição, limpeza, análise, transformação e treino | `notebooks/01_tratamento` e `02_eda`, `src/fraudradar/data`, `src/fraudradar/features`, `src/fraudradar/model`, `notebooks/03_modelo`, [`docs/model.md`](docs/model.md) |
| Integração com IA de terceiros usando base de conhecimento | Gemini com RAG em pgvector sobre a Lei 9.613 (`rag/`, `src/fraudradar/ai`, `notebooks/04_avaliacao_llm`, [`docs/chat-routing.md`](docs/chat-routing.md)) |
| Backend e frontend | `api/` (FastAPI) e `worker/` (Python); `web/` (Next.js) |
| Banco de dados | Postgres 17 + pgvector (`db/init/`, DER em [`docs/erd/`](docs/erd/README.md)) |
| Infraestrutura automatizada com Terraform | [`infra/terraform/`](infra/terraform/README.md) (local, Docker) e `infra/terraform-oci/` (VM na Oracle Cloud) |
| Arquivos de prompts do vibe-coding | [`docs/vibe-coding/prompts/`](docs/vibe-coding/prompts/) (um arquivo por prompt, delegação e resultado) |

O projeto atende às **duas** abordagens de IA pedidas: o modelo treinado (LightGBM) e a
integração com IA de terceiros (Gemini com RAG).

## O que o sistema faz

1. **Entrada de transações**: carga do SAML-D, envio de CSV ou de uma transação pela API,
   conexão com um banco Postgres externo ou transações simuladas para a demonstração.
2. **Processamento semanal** (worker): calcula as variáveis com o histórico das contas, dá o
   score do LightGBM, roda as regras de cenário em SQL e grava a fila de até 300 contas por
   semana, com as evidências. Também sorteia uma pequena **amostra de controle** fora da fila,
   para medir o que o modelo deixa passar.
3. **Análise** (front): o analista abre o alerta, vê a nota, as contribuições, as regras, as
   movimentações e o grafo de 2 saltos, e pode pedir à IA o **parecer** ou conversar sobre o
   alerta.
4. **Decisão**: arquivar (com o motivo), aprofundar ou comunicar ao COAF. A comunicação gera um
   rascunho que precisa de aprovação. Tudo fica em `audit_log`.
5. **Retorno e retreino**: as decisões viram rótulos (`analyst_labels`); em Configurações o
   modelo pode ser retreinado, e a versão nova só é promovida se não piorar a ativa.

Não há tempo real: o worker reavalia em lote o período semanal aberto, por intervalo
configurável ou sob demanda; períodos fechados ficam congelados.

### Telas

| Tela | Rota | O que mostra |
|---|---|---|
| Visão geral | `/dashboard` | resumo da semana e os alertas mais urgentes |
| Fila de alertas | `/alerts` | fila da semana com busca, filtros e paginação |
| Detalhe do alerta | `/alerts/[id]` | nota, contribuições, regras, movimentações, grafo, parecer da IA, decisão e comunicação ao COAF |
| Contas suspeitas | `/accounts` | contas com alerta consolidadas entre semanas |
| Monitoramento | `/monitoring` | indicadores e séries da semana e o retorno dos analistas |
| Fontes de dados | `/ingestion` | envio de CSV, conjuntos de dados, conexões externas e simulação |
| Configurações | `/settings` | perfil, aparência, processamento, versões do modelo e sistema |
| Login, cadastro e nova senha | `/login`, `/signup`, `/reset-password` | Supabase Auth |
| Assistente | botão flutuante em todas as telas | chat com a IA, histórico e troca de modelo |

O front existe em português (padrão) e inglês, com o seletor no cabeçalho. Com
`NEXT_PUBLIC_USE_MOCKS=true` ele roda com dados simulados, sem API.

## Arquitetura

```
             CSV / API / Postgres externo / simulação
                              │
                              ▼
┌──────────┐   lê e grava   ┌───────────────────────────┐   lê    ┌──────────────┐
│  worker  │ ─────────────▶ │ Postgres 17 + pgvector    │ ◀────── │  API FastAPI │
│ (Python) │                │ transações, scores,       │         │  (Python)    │
│ LightGBM │                │ alertas, evidências,      │ grava   │ decisões,    │
│ regras   │                │ decisões, RAG, auditoria  │ ◀────── │ ingestão,    │
└──────────┘                └───────────────────────────┘         │ IA (Gemini)  │
      ▲                                                            └──────┬───────┘
      │ fila de trabalhos (public.jobs)                                   │ HTTPS + JWT
      └───────────────────────────────────────────────────────────────────┤
                                                                          ▼
                                                          ┌──────────────────────────┐
                                                          │ Front Next.js (analista) │
                                                          └──────────────────────────┘
```

- **`src/fraudradar`** é o pacote compartilhado: dados, variáveis, modelo e IA. A API, o worker
  e os notebooks importam dele; ninguém reimplementa a lógica.
- **A API não roda o modelo**: ela lê o que o worker gravou. Pedidos pesados (processar,
  importar, treinar) viram trabalhos em `public.jobs`, que o `worker serve` executa.
- **A chave do LLM fica só no servidor**; o front fala só com a API.
- Produção: API numa VM da Oracle Cloud (`infra/docker-compose.prod.yml`, `infra/terraform-oci`)
  e front na Vercel, publicado a cada merge na `main`.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Linguagens | Python 3.12 e TypeScript |
| Pacote compartilhado | `src/fraudradar`, gerenciado com **uv** (`pyproject.toml` e `uv.lock` na raiz) |
| Machine Learning | LightGBM, scikit-learn (K-Means), pandas, NumPy |
| IA generativa | Google Gemini, RAG com `sentence-transformers` (`intfloat/multilingual-e5-small`) e pgvector |
| API | FastAPI + Pydantic + SQLAlchemy (psycopg) |
| Worker | processo Python em lote, fila persistente no banco e agendador contínuo |
| Banco | PostgreSQL 17 + pgvector (imagem `pgvector/pgvector:pg17`) |
| Front | Next.js 16 (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, next-intl, Cytoscape.js, Recharts, pnpm |
| Autenticação | Supabase Auth (JWT validado na API) |
| Infra | Docker Compose e **Terraform** (provider `kreuzwerker/docker`; Oracle Cloud em produção) |
| CI | GitHub Actions: lint, testes e build a cada push |
| Notebooks | Jupyter |

## Dados e modelo

- **Base**: SAML-D, 9,5 milhões de transações sintéticas com 12 colunas, entre elas o
  gabarito (`Is_laundering`, `Laundering_type`). O gabarito vai para a tabela `ground_truth`,
  separada, e **o modelo nunca o lê para dar nota**: ele só serve de alvo no treino e de régua na
  avaliação.
- **Tratamento** (`notebooks/01_tratamento`, `src/fraudradar/data`): tipos compactos para caber
  1 GB em memória, limpeza dos nomes das tipologias, datas, carga no Postgres.
- **Análise exploratória** (`notebooks/02_eda`): distribuição por tipologia, país, moeda e tipo de
  pagamento; a lavagem é cerca de 0,1% das transações.
- **Variáveis** (`src/fraudradar/features`): 21 variáveis por transação, calculadas só com o
  passado das contas (sem vazar o futuro), mais sinais semanais e o grafo de contrapartes.
- **Modelo** (`src/fraudradar/model`, `notebooks/03_modelo`): LightGBM com divisão no tempo
  (treino até 23/04/2023, validação de 24/04 a 21/05/2023 e teste nas 14 semanas
  seguintes), comparado no `lab/` com regras,
  regressão logística, GRU e Isolation Forest.

| Número do modelo oficial (teste) | Valor |
|---|---|
| PR-AUC | 0,896 |
| Recall com 0,13% de falso positivo | 89,7% |
| Fila com corte: recall / precisão / inocentes por semana | 95,1% / 99,0% / 2,2 |
| Recall nas lavagens de contas que nunca lavaram antes | 96,0% |

Explicação completa, configuração e comparações em [`docs/model.md`](docs/model.md).

Ao lado do modelo, 5 **regras de cenário** em SQL (`db/rules/`) marcam padrões conhecidos de
PLD: fracionamento em espécie, muitas contrapartes, jurisdição de maior risco, salto de volume e
atividade concentrada em espécie.

## IA generativa

- **Base de conhecimento** (`rag/`): a Lei 9.613/1998 em `rag/snapshots/`, com hash e status de
  revisão. `python -m worker rag-load` divide o texto em trechos, gera os vetores e grava em
  `rag_documents` (pgvector, índice HNSW). A Circular BCB 3.978/2020 também está no repositório,
  mas aguarda revisão humana e ainda não entra nas respostas.
- **Parecer do alerta** (`POST /alerts/{id}/assessment`): resume a evidência **sem número de
  conta**, busca os trechos da lei (busca híbrida por texto e vetor), pede ao Gemini um rascunho
  com citações e uma tipologia sugerida, e o servidor confere cada citação antes de gravar.
- **Chat**: o assistente classifica a pergunta (conversa, conceito de PLD, lei, apoio à decisão,
  uso do sistema ou fora do escopo). No alerta, ele lista indícios a favor e contra e deixa claro
  que a decisão é do analista. No resto do app, consulta a fila e as semanas com ferramentas só
  de leitura e sugere links das telas. Desenho em [`docs/chat-routing.md`](docs/chat-routing.md).
- **Avaliação** (`notebooks/04_avaliacao_llm`): fidelidade às fontes e o validador de citações.
- **Privacidade**: números de conta, e-mails e URLs são removidos antes de qualquer prompt; o
  modelo pode ser trocado entre os Gemini liberados em `LLM_MODEL_OPTIONS`, com troca automática
  quando um está indisponível.

## Estrutura do repositório

```
fraudradar/
├── src/fraudradar/      # pacote compartilhado
│   ├── config.py        # configurações lidas do .env
│   ├── db.py            # conexão com o Postgres
│   ├── data/            # carga do SAML-D, ingestão, simulação, validação
│   ├── features/        # histórico da conta, sinais semanais, grafo
│   ├── model/           # treino, score, fila, explicação, segmentos, retreino
│   └── ai/              # RAG, parecer, roteamento do chat e agente com ferramentas
├── api/                 # FastAPI: routes/, repositories/, schemas/ (leia api/AGENTS.md)
├── worker/              # lote semanal, fila de trabalhos, treino, carga do RAG
├── web/                 # Next.js: src/features/<módulo>/{components,hooks,services,schemas}
├── db/
│   ├── init/            # SQL da criação do banco (extensões, tabelas, plataforma, chat)
│   ├── upgrades/        # scripts idempotentes para bancos que já existem
│   └── rules/           # regras de cenário em SQL (R-001 a R-005)
├── rag/                 # fontes do RAG: sources.json e snapshots/ (Lei 9.613, Circular 3.978)
├── notebooks/           # 01_tratamento, 02_eda, 03_modelo, 04_avaliacao_llm
├── tests/               # pytest: unidade, API e worker contra Postgres de verdade
├── infra/
│   ├── docker-compose.yml       # db, api, web, worker e worker-serve
│   ├── docker-compose.prod.yml  # produção na VM da Oracle
│   ├── terraform/               # os mesmos containers via Terraform
│   └── terraform-oci/           # a VM da Oracle Cloud
├── docs/                # etapas, BPMN, DER, modelo, chat, glossário, prompts
├── data/                # SAML-D.csv (fora do git), ver data/README.md
├── models/              # modelos treinados (fora do git)
├── lab/                 # rascunho da equipe (fora do git, só o README e um notebook)
├── .agents/skills/      # instruções para as IAs que trabalham no repositório
└── .github/workflows/   # CI
```

## Como rodar

### Pré-requisitos

Docker (com Compose 2.24+), [uv](https://docs.astral.sh/uv/), Node 24 e pnpm 10. Terraform é
opcional. Para o fluxo completo, o `SAML-D.csv` (Kaggle, dataset "SAML-D", Oztas et al.) em
`data/` (veja [`data/README.md`](data/README.md)) e pelo menos 8 GB de memória para o Docker.

### 1. Só o front, com dados simulados

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_USE_MOCKS=true já vem ligado
pnpm install
pnpm dev                     # http://localhost:3000, com a faixa "Ambiente demonstrativo"
```

O Next não lê o `.env` da raiz, só o `web/.env.local`. O login continua pelo Supabase Auth:
preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

### 2. Sistema completo, local

```bash
cp .env.example .env            # preencha GEMINI_API_KEY e LLM_MODEL para usar a IA
uv sync --all-groups            # cria .venv com Python 3.12 e todas as dependências
docker compose up -d db
uv run --group ml python -m fraudradar.model train   # ~3 min: treina o LightGBM em models/
uv run python -m worker load       # ~1,5 min e ~3 GB: 9,5 milhões de transações no Postgres
uv run python -m worker backfill   # ~1,5 min e ~7 GB: as 14 semanas do teste
docker compose run --rm worker rag-load   # base do chat jurídico (Lei 9.613)
docker compose up -d --build       # sobe db, api, web e o executor de trabalhos
```

- Front: http://localhost:3000
- API (Swagger): http://localhost:8000/docs
- Saúde: http://localhost:8000/health

Login: o front usa o Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Em desenvolvimento, `AUTH_DISABLED=true` faz a API
aceitar pedidos sem sessão como "Analista local".

### 3. Com Terraform

Sobe os mesmos containers do Compose, com prefixo `fraudradar-tf` (não rode os dois juntos, as
portas colidem). Recursos, variáveis e passo a passo em
[`infra/terraform/README.md`](infra/terraform/README.md).

```bash
cd infra/terraform
terraform init
terraform apply -var 'docker_host=npipe:////./pipe/docker_engine'   # Windows
terraform apply                                                      # Linux/macOS
```

### Outros comandos

```bash
docker compose run --rm worker batch --week 2023-05-22   # processa uma semana
cd web && pnpm dev                          # front em modo dev (com a API rodando)
docker compose down                         # para tudo (o volume do banco fica)
docker compose down -v                      # para e APAGA o banco (re-roda db/init)
```

### Variáveis de ambiente

Todas em [`.env.example`](.env.example), comentadas:

| Grupo | Variáveis |
|---|---|
| Banco | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` |
| IA (só na API e no worker) | `LLM_PROVIDER`, `GEMINI_API_KEY`, `LLM_MODEL`, `LLM_MODEL_OPTIONS`, `EMBEDDING_MODEL` |
| Modelo | `MODEL_DIR`, `MODEL_FILE` |
| API | `CORS_ORIGINS`, `SUPABASE_URL`, `AUTH_DISABLED`, `INGESTION_MAX_BYTES`, `INGESTION_MAX_ROWS` |
| Bancos externos | `CONNECTIONS_SECRET_KEY`, `EXTERNAL_DB_ALLOWED_HOSTS` |
| Front | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_USE_MOCKS`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

### Banco: criação e atualização

As tabelas são criadas por `db/init/*.sql` só na **primeira** subida do volume. O
`002_tables.sql` cria as tabelas de dados do SAML-D em `public`; o `003_platform.sql` cria o
catálogo de conjuntos de dados e a fila de trabalhos. Conjuntos adicionais recebem uma cópia do
DDL de dados em um schema próprio. Mudou qualquer SQL de esquema? Avise o time: para aplicar na
base local é preciso recriar o volume com `docker compose down -v` e subir novamente (esse
comando apaga os dados locais), ou rodar o script de `db/upgrades/` (abaixo).

Atualizou um banco que já existia sem recriá-lo? Rode `uv run python -m worker labels` (ou
`docker compose run --rm worker labels`). Ele mede o gabarito de cada conjunto registrado e
preenche `public.datasets.labeled_weeks` e `has_laundering`, que só são calculados sozinhos
depois de `load`, de uma importação com gabarito e de cada treino. Sem eles, a API recusa o
retreino como se o conjunto não tivesse gabarito. `--dataset SLUG` mede um conjunto só.

#### Scripts de atualização

Mudanças de esquema depois da criação do volume ficam em `db/upgrades/`, fora de `db/init` (não
rodam na criação do volume, que já nasce atualizado). Cada script pode rodar mais de uma vez e
vale para `public` e para o schema de cada conjunto registrado. Para manter os dados em vez de
`docker compose down -v`:

```bash
# 006: retorno dos analistas e amostra de controle (docs/analyst-feedback.md)
docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
  < db/upgrades/006_analyst_feedback.sql
docker compose up -d --build api web worker-serve   # o código novo usa as colunas novas

# 007: troca de idioma do front — mensagens dos trabalhos com código e parâmetros
docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
  < db/upgrades/007_i18n.sql

# 008: aceita a origem antiga `manual` em ingestions (precisa de public.datasets; roda depois de 006/007)
docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
  < db/upgrades/008_legacy_ingestion_sources.sql

# 009: histórico de conversas do assistente (chat_conversations e chat_messages)
docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1   < db/upgrades/009_chat.sql
```

O `006` cria `analyst_labels`, `alerts.origin`, `decisions.archive_reason` e
`processing_settings.exploration_per_week`, e transforma em rótulo de lavagem confirmada a última
decisão de comunicar de cada alerta (arquivamento antigo não tem motivo e não vira rótulo). Semanas
já processadas só ganham a amostra de controle se forem reprocessadas.

O `007` só acrescenta `jobs.message_code` e `jobs.message_params` (a mensagem em português segue
em `jobs.message`; o front traduz pelo código quando o conhece). Trabalhos antigos ficam com as
colunas nulas e mostram o texto em português.

O `008` refaz a restrição de origens de `ingestions` para aceitar a origem antiga `manual` além
das atuais (`csv`, `api`, `simulation`, `connection`), em `public` e no schema de cada conjunto. Ele
precisa de `public.datasets`, então roda depois do `006` e do `007`.

O `009` cria `public.chat_conversations` e `public.chat_messages`, o histórico das conversas do
assistente, que um banco novo já ganha com `db/init/006_chat.sql`.

## Testes e CI

```bash
uv run ruff check . && uv run ruff format --check .   # lint e formatação do Python
docker compose up -d db                               # os testes da API e do worker usam o Postgres
uv run --group api --group ml pytest                  # testes do Python
cd web && pnpm lint && pnpm test && pnpm build        # lint, testes e build do front
```

Os testes da API e do worker criam e apagam o banco `fraudradar_test` no Postgres do Compose;
sem ele, são pulados (`REQUIRE_TEST_DB=1` faz falhar em vez de pular). Outro servidor:
`TEST_DATABASE_URL` (o nome do banco precisa terminar em `_test`). Os do modelo e do worker
precisam do grupo `ml`.

O CI (`.github/workflows/ci.yml`) roda a cada push e PR: job `python` (lint e pytest com
Postgres), job `web` (lint, testes e build) e job `terraform` (`fmt` e `validate`).

## API

Swagger em http://localhost:8000/docs. Toda rota, menos `/health`, exige o access token do
Supabase Auth (`Authorization: Bearer ...`), validado pela chave pública do projeto; o nome do
perfil do analista vai para decisões, aprovações e auditoria. Em desenvolvimento,
`AUTH_DISABLED=true` dispensa o login. Os erros trazem um `code` estável, que o front traduz.

| Rota | O que faz |
|---|---|
| `GET /health` | saúde do banco, do modelo e do LLM (`ok` ou `degraded`); sem login |
| `GET /weeks` | todos os períodos processados (`current` é o mais recente; `next_release` fica `null`) |
| `POST /replay/next-week` | compatibilidade do replay antigo; não controla mais a visibilidade |
| `GET /accounts/suspicious` | contas com alerta consolidadas entre períodos, com filtros e paginação |
| `GET /accounts/{account}/alerts` | histórico de alertas semanais da conta |
| `GET /alerts?week=` | fila paginada da semana (filtros `status`, `country`, `search` e `origin`); a amostra de controle vem no fim |
| `GET /alerts/{id}` | detalhe: contribuições, regras, movimentações e último parecer |
| `GET /alerts/{id}/graph` | vizinhança de 2 saltos da conta na semana |
| `POST /alerts/{id}/decision` | arquivar (com o motivo: falso positivo confirmado ou sem evidência suficiente), aprofundar ou comunicar, com justificativa; grava o rótulo do retorno |
| `GET /alerts/{id}/report` | rascunho da comunicação ao COAF |
| `POST /alerts/{id}/report/approve` | aprova a comunicação e encerra o alerta |
| `GET /monitoring?week=` | indicadores e séries da semana (`score_histogram` e `status_counts`); sem recall: as telas de operação não usam o gabarito |
| `GET /feedback/summary` | retorno dos analistas: rótulos, precisão confirmada, amostra de controle e se dá para retreinar com ele |
| `POST /alerts/{id}/assessment` | gera o parecer do alerta: resume a evidência sem número de conta, busca na base jurídica revisada, pede ao Gemini um rascunho com citações e uma tipologia sugerida, confere as citações e grava em `assessments`, com a tipologia no alerta e o registro em `audit_log` |
| `POST /alerts/{id}/chat` | pergunta do analista sobre o alerta, com o mesmo resumo protegido; apoio à decisão com indícios a favor e contra |
| `POST /chat` | assistente geral: conversa, conceitos de PLD, perguntas jurídicas com o RAG e citações, e perguntas sobre o sistema (ferramentas só de leitura) |
| `GET /ai/models` | modelos Gemini liberados para o seletor do assistente |
| `GET /chat/conversations`, `GET`, `DELETE /chat/conversations/{id}` | histórico das conversas do analista logado no conjunto atual |
| `POST /ingestion/csv` | CSV do SAML-D sem as colunas de avaliação; tudo ou nada (abaixo) |
| `POST /ingestion/transactions` | uma transação no mesmo formato, em JSON |
| `GET`, `POST /ingestion/connections`, `DELETE /ingestion/connections/{id}`, `POST /ingestion/connections/{id}/test`, `POST /ingestion/connections/{id}/import` | fontes Postgres externas: lista, cadastra (senha cifrada, com host em `EXTERNAL_DB_ALLOWED_HOSTS`), remove, testa compatibilidade e enfileira a importação |
| `GET /datasets`, `POST /datasets` | lista os conjuntos ou cria um conjunto vazio e isolado |
| `POST /datasets/{slug}/process` | enfileira o processamento do conjunto |
| `POST /datasets/{slug}/simulate` | enfileira 50 a 5.000 transações sintéticas e depois o processamento |
| `GET`, `PUT /processing/settings` | consulta ou altera intervalo, automação, modo demonstração e amostra de controle do conjunto atual |
| `DELETE /ingestions/{id}` | apaga apenas simulação no período aberto, sem decisão afetada, e reprocessa |
| `GET /jobs?dataset=`, `GET /jobs/{id}` | acompanha os 20 trabalhos mais recentes ou um trabalho |
| `GET /datasets/{slug}/models` | versões do modelo do conjunto (oficial e retreinos), a ativa, a comparação de cada versão nova com a ativa, o retorno usado e se dá para treinar |
| `POST /datasets/{slug}/train` | enfileira o retreino do conjunto, com o retorno dos analistas se pedido (409 sem gabarito ou retorno suficiente) |
| `POST /datasets/{slug}/models/{version}/promote` | promove a versão (`lightgbm_vN` ou `<slug>/vN`) a ativa do conjunto, com auditoria; 409 se a trava de promoção a bloqueou |

Erros da IA: 503 `ai.not_configured` (sem `LLM_MODEL` ou sem a chave do Gemini),
`ai.no_legal_sources` (base do RAG vazia: rode `rag-load`) ou `ai.provider_unavailable`; 502
`ai.provider_failed` ou `ai.invalid_assessment`; 429 `ai.provider_rate_limited`; 500 `ai.context_blocked`
(o resumo ainda tinha dado de conta); 422 `ai.question_too_long`, `ai.alert_context_mismatch` ou `ai.model_not_allowed`.

A API não roda o modelo: ela lê o que o worker grava; todo período em `weekly_batches` fica
visível. Os formatos JSON que o worker grava (evidências e métricas da semana) estão comentados
em `db/init/002_tables.sql` e, completos, na seção [Worker](#worker). As rotas de dados aceitam
`X-Dataset`; sem o cabeçalho usam `saml-d`. Um slug desconhecido responde 404 antes de executar a
consulta no schema.

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

## Worker

O worker transforma as transações do Postgres na fila semanal de alertas. Ele processa uma
semana (de segunda 00:00 à segunda seguinte) por vez, sempre lendo do banco; a API mostra
todo período processado. Precisa do grupo `ml` e de um modelo treinado em `models/`
(`docs/model.md`).

| Comando | O que faz |
|---|---|
| `python -m worker load [--csv CAMINHO]` | carrega o `data/SAML-D.csv` em `transactions`, `ground_truth` e `accounts`; uma vez, num banco vazio |
| `python -m worker batch --week AAAA-MM-DD` | processa uma semana (a data é a segunda-feira) |
| `python -m worker backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD]` | processa várias semanas, com as variáveis calculadas uma vez só; sem datas, da primeira semana depois do treino do modelo (em outro conjunto, da primeira com transações) à última com transações |
| `python -m worker replay` | compatibilidade: processa a próxima semana com transações depois da última processada |
| `python -m worker serve` | atende `public.jobs`, recupera trabalho interrompido e agenda os conjuntos vencidos |
| `python -m worker labels [--dataset SLUG]` | mede de novo o gabarito (semanas rotuladas e se há lavagem) e grava em `public.datasets`, que a API usa para liberar o retreino; sem `--dataset`, todos os conjuntos registrados. Para um banco que já existia (seção "Banco: criação e atualização") |
| `python -m worker simulate-analyst [--from DATA] [--to DATA] [--error-rate 0.1] [--insufficient-rate 0.2] [--seed N] [--undo]` | analista simulado da demonstração: decide pelo gabarito os alertas sem decisão das semanas fechadas, com erro de propósito; `--undo` desfaz (`docs/analyst-feedback.md`) |
| `python -m worker feedback-eval [--include-simulated]` | o experimento honesto do retorno: controle e tratamento na mesma divisão, em `models/<slug>/feedback-eval-*.json`, sem registrar versão |
| `python -m worker rag-load [--snapshots PASTA]` | carrega os snapshots de `rag/snapshots/` (hoje, a Lei 9.613) em `rag_documents`, a base do chat jurídico. Confere os hashes e grava tudo ou nada. Rodar de novo só refaz o snapshot que mudou, como a aprovação da revisão. Não precisa do grupo `ml`, só do `ai` |

`batch` e `backfill` aceitam `--force` (refaz uma semana já processada) e `--allow-in-sample`
(aceita uma semana do período de treino do modelo). O worker sai com 0 quando dá certo ou não
há nada a fazer, e com 1 em erro, com a mensagem do que rodar.
`load`, `batch`, `backfill` e `replay` aceitam `--dataset SLUG` (padrão `saml-d`) e
aplicam o schema registrado antes de qualquer consulta. Quando o conjunto define
`active_model_version`, o worker lê `models/<slug>/<versão>.txt` e a ficha JSON ao
lado; sem versão ativa, usa o modelo oficial atual, preservando o fluxo do SAML-D.

### Preparar o banco da demo

```bash
docker compose up -d db
uv run python -m worker load       # ~1,5 min e ~3 GB de memória: 9,5 milhões de transações
uv run python -m worker backfill   # ~1,5 min e ~7 GB: as 14 semanas do teste (22/05 a 21/08/2023)
docker compose up -d --build api web
```

Depois, todos os períodos processados já aparecem no app; novas rodadas usam **Processar
agora** ou o agendador do `worker serve`. Pelo Docker: `docker compose run --rm worker load`
e `docker compose run --rm worker backfill` (a
imagem tem o grupo `ml`; `models/` e `data/` são montados, e o `data/SAML-D.csv` precisa ser
um arquivo, não um atalho para fora da pasta). Tempos medidos num Mac de 16 GB.

Memória: o pico é o `compute_features` nas 9,5 milhões de transações, 7 GB medidos num
container Linux (no Mac o Monitor de Atividade mostra uns 4,5 GB, porque comprime a
memória). Vale também para cada `batch` e `replay`, porque o histórico das variáveis sempre
começa em `history_start`. Dê ao Docker pelo menos 8 GB (ou rode pelo host) e não rode o
treino, o worker e a suíte de testes ao mesmo tempo.

### O que o worker garante

- **Só fora do treino**: no conjunto em que o modelo treinou (`training_dataset` da ficha;
  ficha sem o campo é a do oficial, `saml-d`), processa semanas que começam depois de
  `train_end` (o período de teste do modelo). Semana do treino é recusada sem
  `--allow-in-sample`: o modelo já viu esses scores, e a demo pareceria melhor do que é. Em
  outro conjunto o modelo nunca viu as transações: toda semana é processada, mesmo com datas
  anteriores ao treino, e o histórico das variáveis começa na primeira transação dele.
- **O mesmo modelo**: as variáveis saem de `compute_features` com as transações desde
  `history_start` da ficha (as contagens do histórico dependem desse início), com as
  categorias da ficha, e o score é o do booster. No SAML-D inteiro, os 2,76 milhões de scores
  do teste são iguais aos do treino, e a fila das 14 semanas repete a ficha: recall 95,1%,
  precisão 99,0% e 2,2 inocentes por semana.
- **Gabarito fora do score**: no lote, só `worker/metrics.py` lê `ground_truth`, depois de a
  fila da semana estar gravada. Fora do lote, leem também `worker/labels.py` (resumo do registro)
  e `worker/simulate_analyst.py` (o analista simulado da demonstração).
- **Amostra de controle**: além da fila, sorteia `exploration_per_week` contas ativas fora dela
  (padrão 5), com a mesma chance e sem olhar a nota, gravadas como alertas de origem
  `exploration`, depois da fila. A semente sai do conjunto e da semana: o recálculo do período
  aberto sorteia as mesmas contas. Elas ficam fora das métricas.
- **Trabalho do analista nunca é apagado**: semana já processada fica como está; `--force`
  apaga e refaz os alertas, os scores e o lote da semana, mas é recusado se a semana já foi
  liberada ou se algum alerta tem decisão (ou já saiu do status `new`).
- **Uma transação do banco por semana**: ou a semana sai inteira, ou nada é gravado.

### O que cada semana grava

| Tabela | O quê |
|---|---|
| `model_versions` | a versão da ficha (`lightgbm_vN`), a única ativa; `threshold` é o corte da fila (`queue_cut`) e `metrics` traz as métricas da ficha com `transaction_threshold` |
| `transaction_scores` | um score por transação da semana |
| `alerts` | a fila (`origin = model`): contas (nunca o CAIXA) com score de pelo menos o corte, até `queue_size` (300), da maior para a menor (empate: a conta menor primeiro). O score da conta é o maior das transações que ela enviou ou recebeu; `countries` vem pelo valor movimentado; `total_amount` e `transaction_count` resumem as transações da conta na semana; `typology` fica vazia: quem a preenche é o parecer (`POST /alerts/{id}/assessment`), quando o Gemini sugere uma das 17 tipologias do SAML-D. Depois dela, a amostra de controle (`origin = exploration`) |
| `evidence` | `contributions` (todas as variáveis, em log-odds, na transação de maior score da conta), `rules` (as de `db/rules/`, ver o README de lá), `weekly_signals` e `graph` vazio (a API monta o grafo) |
| `accounts` | primeira e última transação das contas da semana (conta nova da ingestão entra aqui) e o segmento do K-Means das contas ativas, pelo perfil das 12 semanas anteriores |
| `weekly_batches` | a semana, as contas ativas e as métricas contra o gabarito; `released_at` é legado e não controla visibilidade |
| `ingestions` | envios `csv`, `api`, `simulation` ou `connection`; passam a `processing` e depois a `completed` |
| `audit_log` | `actor = worker`, `action = batch`, `entity = week`, com alertas, versão do modelo e contas ativas |

`evidence.weekly_signals`: `sent_count`, `received_count`, `sent_amount`, `received_amount`,
`distinct_counterparties`, `cash_share` (fração em espécie) e `cross_border_share` (fração
com países diferentes), sobre as transações da conta na semana como estão no banco: as mesmas
que a API lista no detalhe do alerta.

`weekly_batches.metrics`: `recall` e `precision` da fila (conta-semana lavadora: alguma
transação dela tem rótulo 1, com o CAIXA, como na avaliação do modelo), as contagens
`laundering_accounts`, `queue_size` e `innocents_in_queue`, `country_rates` (só países com 30
ou mais contas ativas na semana, pelo país principal da conta) e `payment_type_rates`. Só
contam as transações com gabarito: as enviadas pela API ficam fora. `typology_accuracy` fica
de fora enquanto o modelo não prevê tipologia. Essas métricas são avaliação de desenvolvimento:
a API não as serve às telas de operação (`docs/analyst-feedback.md`).

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/development-process.md`](docs/development-process.md) | as etapas do desenvolvimento, da escolha da base à entrega |
| [`docs/bpmn/`](docs/bpmn/README.md) | BPMN: monitoramento de ponta a ponta, processamento do período e retreino |
| [`docs/erd/`](docs/erd/README.md) | DER do banco em quatro diagramas |
| [`docs/model.md`](docs/model.md) | o modelo LightGBM: variáveis, treino, números e comparações |
| [`docs/analyst-feedback.md`](docs/analyst-feedback.md) | retorno dos analistas, amostra de controle e retreino |
| [`docs/external-data.md`](docs/external-data.md) | conjuntos de dados, bancos externos, simulação e retreino por conjunto |
| [`docs/chat-routing.md`](docs/chat-routing.md) | roteamento e contrato do chat com a IA |
| [`docs/glossary.md`](docs/glossary.md) | termos do time, nomes do código e termos da tela em inglês |
| [`rag/README.md`](rag/README.md) | fontes da base de conhecimento e como revisá-las |
| [`infra/terraform/README.md`](infra/terraform/README.md) | Terraform recurso por recurso |
| [`notebooks/README.md`](notebooks/README.md) | os quatro notebooks oficiais |
| [`web/API_CONTRACTS.md`](web/API_CONTRACTS.md) | contratos entre o front e a API |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | commits, branches, PRs e o registro dos prompts |
| [`docs/vibe-coding/prompts/`](docs/vibe-coding/prompts/) | cada prompt usado no vibe-coding, com delegações e resultados |

### Vibe-coding

O time desenvolveu com assistentes de código (Claude Code, Codex, Antigravity e Cursor). Cada
prompt de uma pessoa, cada delegação de uma IA para outra e cada resultado viraram um arquivo
Markdown em `docs/vibe-coding/prompts/` (`NNN-autor-assunto.md`, com cabeçalho de id, autor,
destino, prompt de origem e data). Os prompts do RAG feitos pelo Victor estão em
`docs/vibe-coding/prompts/victor-rag-llm/`. As instruções que as IAs seguem neste repositório
ficam em `AGENTS.md`, `api/AGENTS.md`, `web/AGENTS.md` e nas skills de `.agents/skills/`.

## Equipe e regras do time

| Frente | Responsável por |
|---|---|
| 1 Dados e SQL | `notebooks/01_tratamento`, `notebooks/02_eda`, `db/`, `src/fraudradar/data` |
| 2 Modelo | `src/fraudradar/model`, `src/fraudradar/features`, `notebooks/03_modelo` |
| 3 IA generativa | `src/fraudradar/ai`, `rag/`, `notebooks/04_avaliacao_llm` |
| 4 API e front | `api/`, `worker/`, `web/` |
| 5 Processo e entrega | `infra/`, `docs/`, CI |

Regras que valem para todo o código:

- Features e score existem **só** em `src/fraudradar`. API, worker e notebooks importam; não
  reimplementam.
- O modelo nunca lê a tabela `ground_truth` (rótulo e tipologia) para dar nota.
- O LLM **nunca** recebe números de conta, e a chave dele fica só no servidor.
- A IA sugere; quem decide arquivar, aprofundar ou comunicar ao COAF é o analista.
- Nada de dados, modelos ou `.env` no Git.
- Código em inglês; documentação, comentários e mensagens em português.

### Limitações conhecidas

- O SAML-D é sintético: os números do modelo valem para essa base, não para um banco real.
- O processamento é em lote semanal, não em tempo real.
- O modelo não prevê a tipologia; ela vem do parecer da IA.
- A Circular BCB 3.978/2020 está no repositório, mas só entra nas respostas da IA depois da
  revisão humana do texto.
- O sistema apoia o analista e não substitui a análise jurídica nem a decisão humana.
