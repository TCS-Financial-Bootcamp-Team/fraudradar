# AGENTS.md — API

Leia antes o `AGENTS.md` da raiz e o `web/API_CONTRACTS.md`. O código atual é a
referência de estilo: `api/routes/decisions.py` + `api/repositories/decisions.py`
mostram o padrão completo (rota fina, repositório, auditoria, 409).

## Arquitetura

- A API é um *read-model* sobre o Postgres. Ela **não roda o modelo**: a imagem
  só tem o grupo `api` (sem lightgbm/torch). O worker grava `alerts`,
  `evidence` e `weekly_batches`; o replay só libera semanas que o worker já
  processou (`weekly_batches.released_at`).
- Camadas:
  - `routes/<recurso>.py`: só recebe, valida pelo tipo e chama o repositório.
  - `repositories/<recurso>.py`: SQL com SQLAlchemy Core `text()` e parâmetros
    nomeados (`:id`). Nada de ORM. f-string em SQL só para trechos fixos do
    código (como `ALERT_COLUMNS`), nunca para valor vindo do pedido.
  - `schemas/`: Pydantic espelhando o zod de `web/src/features/<modulo>/schemas/`.
    Mudou um lado, mude o outro no mesmo PR.
  - `domain.py`: tradução banco ↔ front usada por várias rotas.
- Banco → front: status `new`/`in_review` → `pending`, `escalated` →
  `escalated`, `reported` → `reported`; score 0–1 vira 0–100; ids e contas
  saem como texto; o país exibido é `countries[0]`.
- Transação de dados: use `DbConnection` (`api/dependencies.py`). Ela resolve
  `X-Dataset` (padrão `saml-d`) e aplica `SET LOCAL search_path` antes da rota;
  slug desconhecido responde 404. Catálogos globais em `public` usam
  `PublicDbConnection`. Cada uma é uma transação por
  requisição, com commit antes da resposta; `HTTPException` faz rollback;
  `statement_timeout` de 15 s. Não abra outra conexão nem faça commit manual.
  Linha que vai mudar: `get_alert_row(..., for_update=True)` (FOR UPDATE).
- Carga em massa: valide tudo antes de gravar e use COPY pelo psycopg da própria
  conexão (`conn.connection.driver_connection`), na mesma transação. Modelo:
  `save_csv` em `api/repositories/ingestion.py`.
- Upload: o Starlette lê o corpo inteiro antes das dependências (até da
  autenticação) e não limita tamanho. Rota que recebe arquivo usa
  `route_class_override=LimitedBodyRoute` (`api/routes/ingestion.py`), que conta os
  bytes enquanto chegam e responde 413 no limite.
- Autenticação: `main.py` protege todos os routers, menos `/health`. A API valida
  o access token do Supabase pela JWKS do projeto (só ES256/RS256). Quem age é
  `CurrentUser`; o nome vai para `decisions.analyst`,
  `reports.approved_by` e `audit_log.actor`. **Toda ação que muda estado
  grava em `audit_log`.** Em dev e nos testes, `AUTH_DISABLED=true`.
- Erros: `AppError(status, code, mensagem, params)` (`api/errors.py`, subclasse de `HTTPException`):
  `detail` em PT-BR que o analista entenda, como sempre, mais `code` estável (`area.codigo`) e `params`
  no corpo, para o front traduzir (`web/messages/<idioma>/errors.json`, `errors.api`). Código novo =
  texto novo nos dois idiomas do front; o teste `web/tests/i18n-server-codes.test.ts` confere. Erro
  que não usa `AppError` segue devolvendo só `detail`. Motivo de bloqueio que o front mostra (retreino,
  trava de promoção, sugestão de compatibilidade) é uma `fraudradar.messages.Msg` (texto + `code` +
  `params`) e a resposta carrega `<campo>_code` e `<campo>_params` ao lado do texto.
  Status: 404 para
  recurso inexistente, 409 para conflito de estado (comunicação aprovada encerra
  o alerta), 413 para envio acima do limite, 422 vem do Pydantic, 501 para o que
  ainda não existe, 503 quando a dependência (IA) está fora. Erro de conteúdo
  (linha de CSV, regra de campo) também é 422, no formato do Pydantic
  (`[{type, loc, msg}]`), com linha e coluna em `loc` e no começo da `msg`.
- Mensagem de trabalho (`public.jobs`): o worker grava `message` (PT-BR) e, junto, `message_code` e
  `message_params` (`worker/jobs.py`); mensagem que aparece na tela leva código. Semana: onde a API
  manda um rótulo pronto (`week_label`), manda também a data ISO (`week`), e o front formata pelo idioma.
- Listas: ordene antes de paginar e limite `page`/`size` na rota.
- LLM e RAG ficam em `src/fraudradar/ai`; a rota só chama. O LLM nunca recebe
  número de conta: pseudonimize antes do prompt. Chave do LLM só na API.

## Dados

- Valores do SAML-D estão em **libras** (`AMOUNT_CURRENCY = "GBP"` em
  `src/fraudradar/data/schema.py`), seja qual for `Payment_currency`. Nunca
  converta nem some por moeda. O motivo está comentado no próprio arquivo.
- Colunas do CSV → tabela: `COLUMN_RENAMES` em `schema.py`. Transação tem as 10 de
  `TRANSACTION_COLUMNS` (o SAML-D tem 12; `Is_laundering`/`Laundering_type` só
  existem em `ground_truth`, e a API nunca lê nem grava essa tabela). O que a API precisa
  saber do gabarito (o retreino é possível?) vem de `public.datasets.labeled_weeks` e
  `has_laundering`, que só o worker preenche (`worker/labels.py`); há teste que proíbe consulta
  a `ground_truth` pela API. Quem lê o gabarito: o treino (`src/fraudradar/model`) e, no worker,
  `worker/metrics.py`, `worker/labels.py` e `worker/simulate_analyst.py`.
- Retorno dos analistas (`docs/analyst-feedback.md`): a decisão grava o rótulo em
  `analyst_labels` na mesma transação (`fraudradar.model.feedback.store_label`); arquivar exige
  `archive_reason`. A API lê e grava `analyst_labels`, nunca mistura com o gabarito.
- Alerta é a conta da fila do modelo: a amostra de controle (`alerts.origin = 'exploration'`) fica
  fora de toda contagem de alertas e das contas suspeitas (`MODEL_ALERTS` em `api/domain.py`). O
  recall e o acerto de tipologia de `weekly_batches.metrics` não vão para as telas.
- Contas são `BIGINT` no banco (no SAML-D, até 10 dígitos). Validação de
  transação que entra (CSV ou JSON): `src/fraudradar/data/ingestion.py`, a mesma
  para API e worker.
- Formatos JSON que o worker grava (evidências, métricas): comentários em
  `db/init/002_tables.sql`.
- Mudança de esquema: só em `db/init/002_tables.sql`, commit com `!` e aviso
  "exige docker compose down -v" (ver `CONTRIBUTING.md`); para bancos que já existem, um script
  idempotente em `db/upgrades/` (ex.: `006_analyst_feedback.sql`, explicado no README).

## Testes

- `tests/api/`, contra um Postgres de verdade. Use os fixtures de
  `tests/conftest.py` (os mesmos de `tests/worker/`): `db` (esvazia as tabelas a
  cada teste), `client` (API com autenticação desligada) e `seed`. Não faça mock
  do banco.
- **Sem banco, os testes são pulados e a suíte fica verde sem ter testado nada.**
  Rode sempre com `REQUIRE_TEST_DB=1`. Se outra pessoa ou agente roda testes
  na mesma máquina, use um banco só seu (o nome precisa terminar em `_test`,
  porque o fixture o apaga):

  ```powershell
  docker compose up -d db
  $env:REQUIRE_TEST_DB = "1"
  $env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_<seunome>_test"
  uv run ruff check . ; uv run ruff format --check . ; uv run pytest
  ```

- Teste o caminho feliz, o 404/409/422 e o que vai para `audit_log`.
