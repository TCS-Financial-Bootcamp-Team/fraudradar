---
id: 063
area: backend
autor: Claude Code (PC do Vinicius)
destino: Vinicius
pai: 062
data: 2026-11-06
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 062 (pedido 061): o worker semanal

Branch `feat/worker-batch`, a partir da `main` em `c55ed71` (o PR #8, da ficha em UTF-8, já
estava mergeado). PR #10, aberto e sem merge:
https://github.com/TCS-Financial-Bootcamp-Team/fraudradar/pull/10. Nenhuma delegação para outra IA.

## Commits

- `4f14382` test(api): move os fixtures do banco para tests/conftest.py
- `3860a31` feat(worker): carrega o SAML-D e monta a fila semanal com o modelo oficial
- `dc5c187` test(worker): testa carga, fila, gabarito, reprocessamento e replay
- `8088c34` ci: instala o grupo ml no job python
- `051302e` docs(worker): documenta o worker no README, no glossário e na skill
- o commit deste registro (062 e 063)

## Como foi feito

- **Modelo**: treinei de novo (`python -m fraudradar.model train`, numa pasta de rascunho) e o
  arquivo do modelo saiu idêntico byte a byte ao `models/lightgbm_v1.txt` (1.190 árvores; a ficha
  difere só em `created_at` e na 16ª casa dos centros do K-Means). O worker usa a v1 oficial. O
  treino levou 28 min de relógio nesta máquina (17 min de CPU), bem mais que os ~5 min do
  pedido, com 5,4 GB de pico (RSS no macOS).
- **Código** (`worker/`): `cli.py` só lê argumentos, loga e devolve o código de saída;
  `load.py` (carga), `batch.py` (planejamento e uma transação por semana), `queue.py` (entrada do
  modelo e fila), `summary.py` (totais, países e sinais semanais), `rules.py` (`db/rules/`),
  `metrics.py` (o único que lê `ground_truth`), `repository.py` (SQL e COPY) e `weeks.py`
  (segunda-feira e fora do treino). Variável e score vêm só de `compute_features`, do booster e
  de `training.explain`; segmento de `account_profile` + `assign_segments`.
- **Leitura**: `COPY ... TO STDOUT` das transações desde `history_start` até o fim da última
  semana pedida, com os mesmos tipos do `load_csv`; as variáveis são calculadas uma vez por
  execução (o backfill inteiro calcula uma vez só).
- **Testes** (`tests/worker/`, 62 novos): os fixtures do banco (`test_db_url`, `db`, `client`,
  `seed`) foram de `tests/api/conftest.py` para `tests/conftest.py`, sem mudar o comportamento
  (só o import do `TestClient` foi para dentro do fixture, para o conftest da raiz carregar sem o
  grupo `api`).

## Decisões tomadas aqui (fora das já decididas no 061)

1. **Contas da fila com o CAIXA; totais e sinais com as contas gravadas.** Score da conta, fila,
   contas ativas e conta-semana lavadora usam as contas depois de `with_cash_account`, como a
   avaliação do modelo. Já `total_amount`, `transaction_count`, `countries`, os sinais semanais e
   o país/meio de pagamento das taxas usam as transações da conta como estão no banco (as mesmas
   que a API lista no detalhe e no grafo, e o que o teste confere com SQL). Cada transação conta
   uma vez por conta; a autotransferência entra nos dois lados de `sent_count`/`received_count`.
2. **`cross_border_share`** = fração com país de origem diferente do de destino (como a
   variável `cross_border`); no SAML-D é quase igual ao meio "Cross-border", menos os saques em
   espécie no exterior, que também contam.
3. **Desempates**: países de mesmo valor em ordem alfabética; a contribuição sai da primeira
   transação (na ordem do tempo) entre as de maior score da conta.
4. **Score**: a fila decide com o score em float64, como a avaliação; o banco guarda REAL
   (float32), e `alerts.score >= model_versions.threshold` vale no banco.
5. **Métrica sem denominador** (semana sem lavadora ou fila vazia): `null` no JSON; a API mostra 0.
6. **Proteção do `--force` mais estrita**: além de liberada e de decisão, também recusa se algum
   alerta saiu do status `new`. E a proteção vale mesmo sem `--force` quando sobrou alerta da
   semana sem lote (estado manual). No `backfill --force`, uma semana protegida recusa o pedido
   inteiro antes de ler o banco.
7. **`audit_log.details`** ganhou `forced` (true/false), para distinguir o reprocessamento.
8. **`load` repetido** sai com 0 e "nada a fazer" (como `batch` em semana já processada), e
   **`load` com transações da API já gravadas é recusado** (código 1): os ids 1..N do CSV
   colidiriam com os da ingestão.
9. **`replay`** pula semanas sem transações (vai para a próxima que tem) e, se só houver semana
   do treino processada, vai para a primeira depois do treino (ele não tem `--allow-in-sample`).
10. **Segmento**: atualizado só para conta ativa com perfil nas 12 semanas anteriores; conta sem
    esse perfil fica com o segmento que tinha (ou nulo).
11. **Arquivo de regra fora do padrão `NNN_nome.sql`, ou regra que falha, para o lote da semana**
    (nada é gravado), em vez de ser ignorado em silêncio.
12. **Modelo dos testes**: com 4 mil transações, o LightGBM oficial (mínimo de 1.000 por folha)
    não divide e dá o mesmo score a todas; as contribuições ficariam zeradas e o teste "mesmos
    scores do modelo" passaria até com o histórico errado. O fixture usa a ficha de `save_model`
    com um booster mais solto nas mesmas variáveis, e escolhe corte e tamanho de fila que valem de
    verdade na primeira semana. O teste confere que, com o histórico começando uma semana depois,
    algum score muda.
13. **`db/init/002_tables.sql` não mudou.** Os 1.071 valores do SAML-D com mais de duas casas
    decimais viram centavos no NUMERIC(14,2); a carga conta e loga. Não mudou nenhum score do
    teste (ver abaixo).

## Como foi verificado

**Gates** (antes do PR):

| Comando | Resultado |
|---|---|
| `uv lock --check` | ok |
| `uv run ruff check .` e `uv run ruff format --check .` | ok |
| `REQUIRE_TEST_DB=1 TEST_DATABASE_URL=postgresql+psycopg://fraudradar:fraudradar@localhost:5433/fraudradar_vinicius_test uv run --group api --group ml pytest` | 370 passed, 0 skipped (antes do PR: 308 passed) |
| `cd web && pnpm lint && pnpm test && pnpm build` | lint ok; 19 testes, 19 passed, 0 skipped; build ok; `git status web/` vazio |

Notas do ambiente: a porta 5432 desta máquina é de outro projeto, então o banco do Compose subiu
na 5433, com nome de projeto próprio (o volume `fraudradar_pgdata` é do outro clone). A máquina não
tem Node: os comandos do `web/` rodaram com Node 24.22.2 e pnpm 10.28.1 portáteis, fora do
repositório.

**Carga e backfill no SAML-D inteiro** (Mac de 16 GB; Docker Desktop com 8,3 GB):

| Passo | Tempo | Pico de memória |
|---|---|---|
| `uv run python -m worker load` | 88 s | 2,9 GB (RSS no macOS) |
| `uv run python -m worker backfill` | 73 s (leitura 7 s, variáveis 12 s, ~4 s por semana) | 4,5 GB (RSS no macOS, que não conta a memória comprimida) |
| `docker compose run --rm worker backfill --force` | 93 s | 6,7 GB no processo (`ru_maxrss` no Linux); o pico é o `compute_features` |

A carga gravou 9.504.852 transações (ids 1 a 9.504.852), 9.504.852 linhas de gabarito e 855.460
contas, com a sequência da identidade em 9.504.852; 1.071 valores foram arredondados para centavos.

**Comparação com a ficha v1** (`lab/vinicius/worker_vs_model.py`, fora do Git), somadas as 14
semanas do teste:

| Fila com corte | Worker | Ficha (`queue_with_cut`) | Diferença |
|---|---|---|---|
| Recall | 95,0830% | 95,0830% | 0,0000 pp |
| Precisão | 99,0080% | 99,0080% | 0,0000 pp |
| Contas por semana | 223,2143 | 223,2143 | 0 |
| Inocentes por semana | 2,2143 | 2,2143 | 0 |

São 3.254 contas-semana lavadoras, 3.125 contas-semana na fila e 31 inocentes. Transação a
transação: os 2.757.347 scores do teste no banco são iguais, em float32, aos do pipeline do treino
recalculado do CSV (`build_training_data` + `booster.predict`); a maior diferença é 0. A fila
gravada é a mesma da avaliação do modelo: 0 conta-semana só de um lado.

| Semana | Transações | Contas ativas | Alertas | Recall | Precisão | Inocentes |
|---|---|---|---|---|---|---|
| 2023-05-22 | 212.910 | 105.690 | 166 | 98,8% | 98,2% | 3 |
| 2023-05-29 | 199.193 | 104.821 | 217 | 97,3% | 100,0% | 0 |
| 2023-06-05 | 212.318 | 107.429 | 241 | 93,0% | 99,2% | 2 |
| 2023-06-12 | 205.524 | 106.566 | 241 | 91,5% | 98,3% | 4 |
| 2023-06-19 | 216.698 | 107.726 | 251 | 96,9% | 100,0% | 0 |
| 2023-06-26 | 208.577 | 106.429 | 211 | 98,1% | 99,5% | 1 |
| 2023-07-03 | 205.846 | 104.828 | 229 | 95,4% | 98,7% | 3 |
| 2023-07-10 | 210.242 | 105.722 | 260 | 94,9% | 99,6% | 1 |
| 2023-07-17 | 200.801 | 104.563 | 236 | 97,1% | 99,6% | 1 |
| 2023-07-24 | 201.537 | 104.414 | 221 | 94,0% | 98,6% | 3 |
| 2023-07-31 | 202.983 | 104.676 | 202 | 95,2% | 97,5% | 5 |
| 2023-08-07 | 207.743 | 105.260 | 249 | 93,9% | 98,8% | 3 |
| 2023-08-14 | 207.038 | 105.775 | 282 | 94,0% | 99,6% | 1 |
| 2023-08-21 (só até quarta, fim do dado) | 65.937 | 46.922 | 119 | 92,0% | 96,6% | 4 |

**Docker**: `docker compose run --rm worker backfill` disse "já processada" nas 14 semanas e saiu com
0. Com `--force`, reprocessou as 14 no container e gravou exatamente os mesmos alertas, scores e
métricas do host (md5 de alerts, transaction_scores e weekly_batches iguais antes e depois).

**API e front reais** (`NEXT_PUBLIC_USE_MOCKS=false`, `docker compose up -d --build db api web`,
API com `AUTH_DISABLED=true`):

- `GET /health`: banco e modelo ok (`degraded` só pela chave do LLM, que não está configurada).
- `POST /replay/next-week`: `{"week": "2023-05-22", "alerts_generated": 166}`; `GET /weeks` passa a
  mostrar a semana, com 166 pendentes.
- `GET /alerts?week=2023-05-22&sort=queue`: 166 alertas, posições 1, 2, 3... em ordem, tipologia
  "Indefinida", 17 países no filtro.
- `GET /alerts/{id}` do primeiro da fila: 6 contribuições com os nomes legíveis (a maior é
  "Primeira transação entre as duas contas", 30,8%), regras vazias, 3 movimentações que somam
  exatamente o `amount` do alerta. `GET /alerts/{id}/graph`: 5 nós e 4 arestas.
- `GET /monitoring?week=2023-05-22`: recall 0,9879 (o gravado pelo worker), taxa de alerta 166 /
  105.690 contas ativas, tipologia "Indefinida" em todos, taxas por país e por meio de pagamento
  (a maior é "Cash Deposit", 0,79%, o viés que o `docs/model.md` já avisa).
- O front sobe, mas `GET /alerts` devolve 307 para `/login`: sem as chaves do Supabase, ele não deixa
  entrar (ver "Em aberto").

## O que o time precisa fazer depois do merge

- Preparar o banco da demo: `docker compose up -d db`, `uv run python -m worker load`,
  `uv run python -m worker backfill` e liberar as semanas no app (README, seção Worker).
- Rebuild da imagem do worker (`docker compose build worker`): ela agora copia `db/rules/`.
- Rodar os testes com o grupo `ml`: `uv run --group api --group ml pytest`.
- Frente 5: o commit `ci:` põe o grupo `ml` no CI para os testes do modelo e do worker rodarem;
  se o tempo do CI pesar mais, dá para descartar só esse commit.

## Em aberto

- **Prints do front logado**: não deu para fazer nesta máquina. Ela não tem
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nem usuário do Supabase, e o
  front manda toda tela para `/login`. A API real foi conferida por HTTP. Falta alguém com as chaves
  liberar uma semana no app, abrir a fila, um detalhe e o monitoramento e anexar os prints aqui.
- **Memória**: cada `batch` e `replay` também calcula as variáveis desde `history_start` e chega a
  ~7 GB num container Linux. O pico está no `compute_features`, da frente 2. Para a demo, o Docker
  precisa de pelo menos 8 GB, ou o worker roda pelo host.
- **Ingestão numa semana já processada**: a transação enviada só ganha score com `--force`, e só se a
  semana ainda não foi liberada; até lá o envio fica em `received` ou `processing`.
- **Documentação de outras frentes**: o comentário de `weekly_batches.metrics` no
  `db/init/002_tables.sql` não lista as chaves novas, nem `weekly_signals`; o README lista. A
  docstring de `src/fraudradar/data/ingestion.py` diz que o worker usaria aquela validação "na carga
  em lote", mas a carga usa `load_csv`, como pede o 061. As duas ficam com a frente 1.
- **Fora do escopo do 061**: tipologia prevista e parecer do LLM (frente 3; `alerts.typology` fica
  nula e `typology_accuracy` fica de fora, e a API mostra 0), as regras de `db/rules/` (frente 1; o
  worker já roda o que entrar lá) e a calibração do score.
- **Texto do front (não mexi)**: o card "Taxa de alerta" diz "Proporção de transações que geraram
  alertas", mas a API calcula alertas / contas ativas; e o rodapé do monitoramento diz que as métricas
  são calculadas "pela API", quando quem calcula é o worker.
- **Fixture dos testes do worker**: o booster mais solto (decisão 12) só existe nos testes. Se a
  frente 2 quiser, pode virar uma opção do `save_model` para dados pequenos.
