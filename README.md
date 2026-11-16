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

Não há tempo real: o worker reavalia em lote o período semanal aberto, por intervalo
configurável ou sob demanda; períodos fechados ficam congelados.

## Stack

| Camada | Tecnologia |
|---|---|
| Python | 3.12 fixo, **uv** (um `pyproject.toml` na raiz, `uv.lock` versionado) |
| Pacote compartilhado | `src/fraudradar` — importado por notebooks, API e worker |
| API | FastAPI + Pydantic (única porta do front; guarda a chave do LLM) |
| Worker | processo Python em lote, fila persistente e agendador contínuo |
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
│   └── ai/              # RAG jurídico do chat: busca híbrida e resposta com citações
├── api/                 # FastAPI: rotas e schemas
├── worker/              # lote semanal e replay
├── web/                 # Next.js
├── db/                  # init/ (extensões e tabelas) e rules/ (cenários SQL)
├── rag/                 # fontes do RAG: sources.json e o snapshot da Lei 9.613
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
docker compose up -d --build    # sobe db, api, web e o executor de trabalhos
```

- Front: http://localhost:3000
- API (Swagger): http://localhost:8000/docs
- Saúde: http://localhost:8000/health

Outros comandos:

```bash
uv run pytest                               # testes; os da API usam o Postgres do Compose
uv run ruff check . && uv run ruff format .  # lint e formatação
docker compose run --rm worker replay       # roda o worker (job em lote; seção Worker)
docker compose run --rm worker batch --week 2023-05-22
uv run --group ml python -m fraudradar.model train  # treina o LightGBM (SAML-D.csv em data/)
cd web && pnpm install && pnpm dev          # front em modo dev (com a API rodando)
docker compose down                         # para tudo (o volume do banco fica)
docker compose down -v                      # para e APAGA o banco (re-roda db/init)
```

O modelo (LightGBM) está explicado em `docs/model.md`: o que ele faz, como treinar, a
configuração oficial e os números.

As tabelas são criadas por `db/init/*.sql` só na **primeira** subida do volume. O
`002_tables.sql` cria as tabelas de dados do SAML-D em `public`; o `003_platform.sql`
cria o catálogo de conjuntos de dados e a fila de trabalhos. Conjuntos adicionais
recebem uma cópia do DDL de dados em um schema próprio. Mudou qualquer SQL de esquema?
Avise o time: para aplicar na base local é preciso recriar o volume com
`docker compose down -v` e subir novamente — esse comando apaga os dados locais.

Atualizou um banco que já existia sem recriá-lo (aplicando o SQL novo à mão)? Rode
`uv run python -m worker labels` (ou `docker compose run --rm worker labels`). Ele mede o
gabarito de cada conjunto registrado e preenche `public.datasets.labeled_weeks` e
`has_laundering`, que só são calculados sozinhos depois de `load`, de uma importação com
gabarito e de cada treino. Sem eles, a API recusa o retreino como se o conjunto não tivesse
gabarito. `--dataset SLUG` mede um conjunto só.

### Atualizar um banco que já existia

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
```

O `006` cria `analyst_labels`, `alerts.origin`, `decisions.archive_reason` e
`processing_settings.exploration_per_week`, e transforma em rótulo de lavagem confirmada a última
decisão de comunicar de cada alerta (arquivamento antigo não tem motivo e não vira rótulo). Semanas
já processadas só ganham a amostra de controle se forem reprocessadas.

O `007` só acrescenta `jobs.message_code` e `jobs.message_params` (a mensagem em português segue
em `jobs.message`; o front traduz pelo código quando o conhece). Trabalhos antigos ficam com as
colunas nulas e mostram o texto em português.

Os testes da API e do worker criam e apagam o banco `fraudradar_test` no Postgres do
Compose (`docker compose up -d db`); sem ele, são pulados. Outro servidor:
`TEST_DATABASE_URL` (o nome do banco precisa terminar em `_test`). Os do modelo e do
worker precisam do grupo `ml`: `uv run --group api --group ml pytest`.

## API

Swagger em http://localhost:8000/docs. Toda rota, menos `/health`, exige o access
token do Supabase Auth (`Authorization: Bearer ...`), validado pela chave
pública do projeto; o nome do perfil do analista vai para decisões, aprovações
e auditoria. Em desenvolvimento, `AUTH_DISABLED=true` dispensa o login.

| Rota | O que faz |
|---|---|
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
| `GET /monitoring?week=` | indicadores e séries da semana (score_histogram e status_counts); sem recall: as telas de operação não usam o gabarito |
| `GET /feedback/summary` | retorno dos analistas: rótulos, precisão confirmada, amostra de controle e se dá para retreinar com ele |
| `POST /chat` | pergunta jurídica geral, respondida com o RAG da Lei 9.613 e citações (frente 3); precisa de `LLM_MODEL`, da chave do Gemini e da base em `rag_documents` |
| `POST /alerts/{id}/assessment`, `/alerts/{id}/chat` | ainda respondem 503: o parecer e o chat do alerta não existem |
| `POST /ingestion/csv` | CSV do SAML-D sem as colunas de avaliação; tudo ou nada (abaixo) |
| `POST /ingestion/transactions` | uma transação no mesmo formato, em JSON |
| `/ingestion/connections` | fontes Postgres externas: lista vazia; cadastro e sincronização respondem 501 |
| `GET /datasets`, `POST /datasets` | lista os conjuntos ou cria um conjunto vazio e isolado |
| `POST /datasets/{slug}/process` | enfileira o processamento do conjunto |
| `POST /datasets/{slug}/simulate` | enfileira 50–5.000 transações sintéticas e depois o processamento |
| `GET`, `PUT /processing/settings` | consulta ou altera intervalo, automação, modo demonstração e amostra de controle do conjunto atual |
| `DELETE /ingestions/{id}` | apaga apenas simulação no período aberto, sem decisão afetada, e reprocessa |
| `GET /jobs?dataset=`, `GET /jobs/{id}` | acompanha os 20 trabalhos mais recentes ou um trabalho |
| `GET /datasets/{slug}/models` | versões do modelo do conjunto (oficial e retreinos), a ativa, a comparação de cada versão nova com a ativa, o retorno usado e se dá para treinar |
| `POST /datasets/{slug}/train` | enfileira o retreino do conjunto, com o retorno dos analistas se pedido (409 sem gabarito ou retorno suficiente) |
| `POST /datasets/{slug}/models/{version}/promote` | promove a versão (`lightgbm_vN` ou `<slug>/vN`) a ativa do conjunto, com auditoria; 409 se a trava de promoção a bloqueou |

A API não roda o modelo: ela lê o que o worker grava; todo período em
`weekly_batches` fica visível. Os formatos JSON que o
worker grava (evidências e métricas da semana) estão comentados em
`db/init/002_tables.sql` e, completos, na seção [Worker](#worker).
As rotas de dados aceitam `X-Dataset`; sem o cabeçalho usam `saml-d`. Um slug
desconhecido responde 404 antes de executar a consulta no schema.

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
`fraudradar-tf`; não rode os dois juntos, as portas colidem). Como funciona, cada
recurso e variável, passo a passo e diferenças em relação ao Compose:
[`infra/terraform/README.md`](infra/terraform/README.md).

```bash
cd infra/terraform
terraform init
terraform apply -var 'docker_host=npipe:////./pipe/docker_engine'   # Windows
```

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
| `python -m worker labels [--dataset SLUG]` | mede de novo o gabarito (semanas rotuladas e se há lavagem) e grava em `public.datasets`, que a API usa para liberar o retreino; sem `--dataset`, todos os conjuntos registrados. Para um banco que já existia (seção "Como rodar") |
| `python -m worker simulate-analyst [--from DATA] [--to DATA] [--error-rate 0.1] [--insufficient-rate 0.2] [--seed N] [--undo]` | analista simulado da demonstração: decide pelo gabarito os alertas sem decisão das semanas fechadas, com erro de propósito; `--undo` desfaz (`docs/analyst-feedback.md`) |
| `python -m worker feedback-eval [--include-simulated]` | o experimento honesto do retorno: controle e tratamento na mesma divisão, em `models/<slug>/feedback-eval-*.json`, sem registrar versão |

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
| `alerts` | a fila (`origin = model`): contas (nunca o CAIXA) com score de pelo menos o corte, até `queue_size` (300), da maior para a menor (empate: a conta menor primeiro). O score da conta é o maior das transações que ela enviou ou recebeu; `countries` vem pelo valor movimentado; `total_amount` e `transaction_count` resumem as transações da conta na semana; `typology` fica vazia (virá do parecer, frente 3). Depois dela, a amostra de controle (`origin = exploration`) |
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
