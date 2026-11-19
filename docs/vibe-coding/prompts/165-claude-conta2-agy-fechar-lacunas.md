---
id: 165
area: processo
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, Gemini 4 Hydrogen (High))
pai: 164
data: 2026-11-19
---

# Fechar as lacunas finais do código e documentação na branch `feat/close-code-gaps`

A IA delegou ao agy, na branch `feat/close-code-gaps`, o fechamento das lacunas finais do
projeto antes da entrega do bootcamp, sem commitar nem abrir PR:

1. **Regras de cenário (`db/rules/`):** criar 4 ou 5 regras determinísticas em SQL seguindo
   `db/rules/README.md` (`NNN_rule_name.sql`, `CAST(:week AS date)`, retorno `account, rule,
   detail JSONB`, cabeçalho com objetivo, parâmetros e base normativa), calibradas em amostra do
   SAML-D para disparar em fração equilibrada das contas, com cobertura pytest em
   `tests/worker/test_worker_rules.py` (análise, execução em semana carregada e teste
   comportamental positivo/negativo por regra).
2. **Notebooks oficiais (`notebooks/`):** criar e executar `01_tratamento.ipynb`, `02_eda.ipynb`
   e `03_modelo.ipynb` (e `04_avaliacao_llm.ipynb` opcional sem chamar a API do Gemini), em PT-BR
   para a banca, importando `src/fraudradar/` e mantendo os arquivos abaixo de ~3 MB.
3. **Documentação para apresentação:** atualizar o BPMN 1 (`docs/bpmn/01-aml-monitoring.bpmn` e
   exportar `.svg`/`.png`), incluir `chat_conversations` e `chat_messages` no DER
   (`docs/erd/01-overview.mmd`, `04-platform.mmd`, `.svg`/`.png` e contagem de 21 tabelas no
   `docs/erd/README.md`), e atualizar a seção 14 de `.agents/skills/fraudradar-overview/SKILL.md`
   e sua cópia em `.claude/skills/fraudradar-overview/SKILL.md`.
4. **Circular BCB 3.978/2020 no RAG:** extrair o texto oficial compilado pelo mesmo pipeline
   (`legal_html.extract_articles`) e gerar o snapshot com `review_status: "pending_review"`, sem
   ativá-lo no chat nem marcá-lo como revisado.

## Resultado

### 1. Regras de cenário em `db/rules/`

Foram criadas cinco regras SQL calibradas na semana `2022-10-31` (103.180 contas reais ativas em
amostra de 1,2 milhão de transações iniciais do `data/SAML-D.csv`, excluindo os lados sintéticos
de espécie):

| Código | Arquivo | Critério / Limiares | Disparos na semana calibrada |
|---|---|---|---|
| `R-001` | `db/rules/001_cash_structuring.sql` | >= 3 `Cash Deposit` em `[1.000, 6.000)` GBP, soma >= 5.000 GBP | 41 contas (0,040%) |
| `R-002` | `db/rules/002_high_counterparty_fan_activity.sql` | >= 15 contrapartes distintas (envio ou recebimento na semana) | 339 contas (0,329%) |
| `R-003` | `db/rules/003_high_risk_jurisdiction.sql` | Transfronteiriça >= 20.000 GBP com `Nigeria`, `Albania`, `Turkey`, `Pakistan`, `UAE` ou `Morocco` | 435 contas (0,422%) |
| `R-004` | `db/rules/004_abrupt_volume_spike.sql` | >= 2 envios, soma >= 50.000 GBP, média prévia (4 sem.) >= 1.000 GBP e razão >= 15x | 478 contas (0,463%) |
| `R-005` | `db/rules/005_cash_heavy_activity.sql` | >= 3 transações, fração em espécie >= 0,75 e soma em espécie >= 4.000 GBP | 23 contas (0,022%) |

Em `tests/worker/test_worker_rules.py`, o teste `test_the_real_rules_folder_follows_the_pattern`
passou a exigir `R-001`..`R-005`, e foram adicionados `test_real_rules_parse_and_run_on_seeded_week`
e um teste comportamental (caso positivo e negativo) para cada regra.

### 2. Notebooks oficiais em `notebooks/`

Todos os quatro notebooks foram criados em PT-BR sobre `src/fraudradar/` e executados com saídas
(todos abaixo de 450 KB):

- `notebooks/01_tratamento.ipynb` (36.043 bytes): `CSV_DTYPES`, `load_csv`, checagens de qualidade,
  `clean_typology` (28 tipologias), round-trip em Parquet e explicação de `worker load`.
- `notebooks/02_eda.ipynb` (438.240 bytes): volume semanal, desbalanceamento (9.494.979 normais vs
  9.873 lavagens), 17 tipologias suspeitas, meios de pagamento, países/moedas e distribuição de
  `amount` em `log1p`.
- `notebooks/03_modelo.ipynb` (305.485 bytes): `compute_features`, corte temporal `OFFICIAL_SPLIT`,
  avaliação do `models/lightgbm_v1` batendo com `docs/model.md` (PR-AUC validação 0,882 / teste
  0,896; fila fixa 300 com recall 96,5%; fila com corte `0,4230` com recall 95,1%, precisão 99,0%
  e 2,2 inocentes/semana; 8 segmentos K-Means com silhueta 0,677), importância de variáveis,
  `explain` e limitações declaradas.
- `notebooks/04_avaliacao_llm.ipynb` (67.233 bytes): validação dos snapshots em `rag/snapshots/`,
  avaliação offline do RAG híbrido com `intfloat/multilingual-e5-small` na Lei 9.613/1998 (100%
  Hit@3 e Hit@5 em 8 perguntas, sem chamar o Gemini) e contrato `present_legal_rag`.

### 3. Documentos e skills

- `docs/bpmn/01-aml-monitoring.bpmn`: removida a marcação amarela de planejado em "Redigir o
  parecer com IA (RAG)" e atualizada a anotação para `POST /alerts/{id}/assessment`; `.svg` e
  `.png` (4570x1660) regenerados via `bpmn-js` e Chromium, e tabela de `docs/bpmn/README.md`
  atualizada.
- `docs/erd/01-overview.mmd` e `04-platform.mmd`: adicionadas `chat_conversations` e
  `chat_messages` (`db/init/006_chat.sql`); `.svg` e `.png` regenerados via Mermaid e Chromium, e
  `docs/erd/README.md` atualizado para 21 tabelas (15 por conjunto + 6 globais).
- `.agents/skills/fraudradar-overview/SKILL.md` e `.claude/skills/fraudradar-overview/SKILL.md`:
  seção 14 e árvore atualizadas e mantidas idênticas.

### 4. Circular BCB 3.978/2020 no RAG

Obtido o texto compilado oficial pela API pública do BCB
(`https://www.bcb.gov.br/api/conteudo/app/normativos/exibenormativo?p1=Circular&p2=3978`) e
processado com `legal_html.extract_articles` e `prepare_legal_snapshot`: gerado
`rag/snapshots/circular-bcb-3978-2020-ad03384f41bc1a00.json` com 70 artigos (`Art. 1` a
`Art. 70`, 94 chunks) e `review_status: "pending_review"`, sem alterar o chat.

### Validação

- `uv run ruff check .` e `uv run ruff format --check .`: aprovados (396 arquivos formatados, 0
  erros).
- `uv run --group api --group ml pytest`: **679 passaram, 401 pulados** (os testes dependentes de
  PostgreSQL foram pulados porque o banco local não estava em execução).
- `REQUIRE_TEST_DB=1 uv run --group api --group ml pytest tests/worker/test_worker_rules.py`: **1
  passou** (`test_the_real_rules_folder_follows_the_pattern`) e **11 erros** de conexão (`localhost:5432`
  indisponível).
- `web/` não foi alterado (`pnpm lint`/`test`/`build` não aplicáveis).

## Revisão da IA orquestradora

- **Testes com banco**: com o Postgres do Compose no ar, `REQUIRE_TEST_DB=1 uv run --group api
  --group ml pytest` passou inteiro (nenhuma falha, nenhum teste pulado por falta de banco).
- **Citações das regras**: conferidas contra o texto do snapshot da Circular. O agy citou os arts.
  43 e 44 (análise e vedação de terceirizar) como base do fracionamento, um "inciso III" que o art.
  39 não tem e o inciso II (financiamento do terrorismo) no salto de volume. Todas passaram a citar
  o art. 39, I, com a alínea certa (a, b, c ou g).
- **R-003**: a lista de países vem do SAML-D, não da lista do Gafi; o cabeçalho diz isso.
- **Disparo no SAML-D inteiro** (banco local, 9,5 milhões de transações), em duas semanas normais
  do teste (05/06 e 10/07/2023; ~35 mil contas e ~250 alertas da fila por semana):

  | Regra | Contas por semana | Dessas, na fila do modelo |
  |---|---|---|
  | R-001 fracionamento em espécie | 45–47 | 2 |
  | R-002 fan-out / fan-in | ~350 | 3–5 |
  | R-003 jurisdição de risco | 480–540 | 8–16 |
  | R-004 salto de volume | ~440 | 2 |
  | R-005 atividade em espécie | 29–43 | 2–3 |

  As regras pegam contas que o modelo não pôs na fila: só de 10 a 25 dos ~250 alertas da semana
  mostram regra na tela. Para a demonstração, escolher antes um alerta que tenha regra.
- **Deck**: os slides 4, 5, 7 e 9 foram corrigidos (parecer não é mais planejado, intervalo do
  worker, o que fica fora do Terraform, 21 tabelas), com o BPMN 1 novo e um DER com colunas do
  caminho principal (11 tabelas) gerado só para o slide.
