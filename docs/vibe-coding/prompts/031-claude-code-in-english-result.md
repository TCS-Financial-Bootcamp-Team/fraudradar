---
id: 031
area: geral
autor: Claude Code (conta 2)
destino: Pedro
pai: 027
data: 2026-10-30
tipo: resposta
---

# Resultado do prompt 027: código em inglês

Branch `refactor/code-in-english`, montada sobre `feat/api-ingestao` (inclui o commit
`7e3b77b` do Victor, com os experimentos LSTM e GRU).

## Como foi feito

- O mapa de nomes ficou em `docs/glossary.md` antes de qualquer código: tabelas, colunas,
  valores gravados, rotas, campos JSON, variáveis de ambiente, pastas e comandos.
- Três delegações paralelas ao agy CLI (028 backend, 029 web, 030 VibeLog), cada uma na
  sua worktree e todas presas ao glossário. A cota dos modelos Claude no Antigravity tinha
  acabado (429, volta em ~3h35), então as três rodaram com `gemini-4-argon-high`.
- Os commits do web e do VibeLog entraram por cherry-pick (histórico linear). O commit do
  Victor entrou por rebase: o notebook foi junto para `lab/` e o `.gitignore` manteve a
  exceção dele, o `.pnpm-store/` (que o commit tinha apagado, por engano ao que parece) e
  os caminhos antigos `dados/` e `laboratorio/` ignorados.
- Feito à mão depois da revisão: o grupo de dependências `ia` virou `ai` (o agy não podia
  mexer no lockfile); a mensagem do commit do web listava endpoints que não existem e foi
  corrigida; o glossário ganhou os valores de `audit_log.action`.

## Verificação

- `ruff check`, `ruff format --check`: verdes. `pytest`: 279 passed, 0 skipped, com
  `REQUIRE_TEST_DB=1` (mesmo número de antes).
- `uv lock --check`, `docker compose config -q`, `terraform fmt -check` e
  `terraform validate`: verdes.
- web: lint, 14 testes, build (só rotas novas). VibeLog: lint, 15 testes, build; o dry-run
  de `pnpm vibelog import-md` lê os 32 registros de prompt, com os pais certos.
- Contrato: o OpenAPI da API e os schemas zod do front batem campo a campo nos 19 pares
  (a única diferença, `movements[].payment_currency`, já existia: o zod descarta).
- De ponta a ponta: API real sobre um banco com o esquema novo, chamada pelos services do
  próprio front (com o zod deles): fila e filtros, detalhe, grafo, decisão, comunicação e
  aprovação, monitoramento, replay, ingestão por JSON e CSV, conexões e os 503 da IA.
  18 de 18 verdes.
- Varredura com parser (ast do Python e compilador do TypeScript): nenhum identificador em
  português fora do contrato externo (colunas do Supabase do VibeLog, a chave legada
  `nome`) e do `moved` do Terraform.

## O que o time precisa fazer depois do merge

- `docker compose down -v` e subir de novo: as tabelas mudaram de nome.
- No `.env`: `AUTH_DESLIGADA` → `AUTH_DISABLED`, `INGESTAO_MAX_*` → `INGESTION_MAX_*`;
  banco de teste com sufixo `_test` e `REQUIRE_TEST_DB=1`; `uv sync --group ai`.
- Apagar `web/.next`, `web/.next-test`, `vibelog/.next` e `vibelog/.next-test`: tipos
  gerados por um `next dev` antigo apontam para as rotas velhas e quebram o `pnpm build`.
- O SAML-D local muda de `dados/` para `data/` (o `git mv` já moveu o CSV nesta máquina).
- Na CLI do VibeLog, os comandos e flags novos estão em `vibelog/AGENTS.md`.

## Pontos em aberto

- O notebook `lab/FraudRadar_LSTM.ipynb` tem ~50 identificadores em português. Não
  traduzi: é rascunho do laboratório e trabalho em andamento do Victor.
- `requirements.txt` na raiz (do commit do Victor) fixa versões diferentes do `uv.lock`
  (ex.: torch 2.15.0 contra 2.14.1).
- Se a recuperação de senha falhar, confira as Redirect URLs do Supabase: o link agora
  volta em `/auth/callback?next=reset` e cai em `/reset-password`.
- Achados antigos que o agy apontou e ninguém corrigiu: a tela de ingestão fala em 11
  colunas (são 10); os mocks do front usam BRL; o README do VibeLog diz que não há cadastro.
