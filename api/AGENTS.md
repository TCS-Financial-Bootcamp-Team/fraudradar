# AGENTS.md — API

Leia antes o `AGENTS.md` da raiz e o `web/CONTRATOS_API.md`. O código atual é a
referência de estilo: `api/rotas/decisoes.py` + `api/repositorios/decisoes.py`
mostram o padrão completo (rota fina, repositório, auditoria, 409).

## Arquitetura

- A API é um *read-model* sobre o Postgres. Ela **não roda o modelo**: a imagem
  só tem o grupo `api` (sem lightgbm/torch). O worker grava `alertas`,
  `evidencias` e `lotes_semana`; o replay só libera semanas que o worker já
  processou (`lotes_semana.liberada_em`).
- Camadas:
  - `rotas/<recurso>.py`: só recebe, valida pelo tipo e chama o repositório.
  - `repositorios/<recurso>.py`: SQL com SQLAlchemy Core `text()` e parâmetros
    nomeados (`:id`). Nada de ORM. f-string em SQL só para trechos fixos do
    código (como `COLUNAS_ALERTA`), nunca para valor vindo do pedido.
  - `schemas/`: Pydantic espelhando o zod de `web/src/features/<modulo>/schemas/`.
    Mudou um lado, mude o outro no mesmo PR.
  - `dominio.py`: tradução banco ↔ front usada por várias rotas.
- Banco → front: status `novo`/`em_analise` → `pendente`, `aprofundado` →
  `aprofundar`, `comunicado` → `comunicar`; score 0–1 vira 0–100; ids e contas
  saem como texto; o país exibido é `paises[0]`.
- Transação: use `Conexao` (`api/dependencias.py`). É uma transação por
  requisição, com commit antes da resposta; `HTTPException` faz rollback;
  `statement_timeout` de 15 s. Não abra outra conexão nem faça commit manual.
  Linha que vai mudar: `linha_do_alerta(..., para_atualizar=True)` (FOR UPDATE).
- Autenticação: `main.py` protege todos os routers, menos `/saude`. A API valida
  o access token do Supabase pela JWKS do projeto (só ES256/RS256). Quem age é
  `UsuarioAtual`; o nome vai para `decisoes.analista`,
  `comunicacoes.aprovado_por` e `auditoria.quem`. **Toda ação que muda estado
  grava em `auditoria`.** Em dev e nos testes, `AUTH_DESLIGADA=true`.
- Erros: `HTTPException` com mensagem em PT-BR que o analista entenda. 404 para
  recurso inexistente, 409 para conflito de estado (comunicação aprovada encerra
  o alerta), 422 vem do Pydantic, 501 para o que ainda não existe, 503 quando a
  dependência (IA) está fora.
- Listas: ordene antes de paginar e limite `pagina`/`tamanho` na rota.
- LLM e RAG ficam em `src/fraudradar/ia`; a rota só chama. O LLM nunca recebe
  número de conta: pseudonimize antes do prompt. Chave do LLM só na API.

## Dados

- Valores do SAML-D estão em **libras** (`MOEDA_DOS_VALORES = "GBP"` em
  `src/fraudradar/dados/schema.py`), seja qual for `Payment_currency`. Nunca
  converta nem some por moeda. O motivo está comentado no próprio arquivo.
- Colunas do CSV → tabela: `RENOMEAR` em `schema.py`. Transação tem as 11 de
  `COLUNAS_TRANSACAO`; `Is_laundering`/`Laundering_type` só existem em
  `avaliacao`, e a API nunca lê nem grava essa tabela.
- Contas são `BIGINT` de até 10 dígitos no banco.
- Formatos JSON que o worker grava (evidências, métricas): comentários em
  `db/init/002_tabelas.sql`.
- Mudança de esquema: só em `db/init/002_tabelas.sql`, commit com `!` e aviso
  "exige docker compose down -v" (ver `CONTRIBUTING.md`).

## Testes

- `tests/api/`, contra um Postgres de verdade. Use os fixtures de
  `tests/api/conftest.py`: `banco` (esvazia as tabelas a cada teste) e
  `cliente` (API com autenticação desligada). Não faça mock do banco.
- **Sem banco, os testes são pulados e a suíte fica verde sem ter testado nada.**
  Rode sempre com `EXIGIR_BANCO_TESTE=1`. Se outra pessoa ou agente roda testes
  na mesma máquina, use um banco só seu (o nome precisa terminar em `_teste`,
  porque o fixture o apaga):

  ```powershell
  docker compose up -d db
  $env:EXIGIR_BANCO_TESTE = "1"
  $env:TEST_DATABASE_URL = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_<seunome>_teste"
  uv run ruff check . ; uv run ruff format --check . ; uv run pytest
  ```

- Teste o caminho feliz, o 404/409/422 e o que vai para `auditoria`.
