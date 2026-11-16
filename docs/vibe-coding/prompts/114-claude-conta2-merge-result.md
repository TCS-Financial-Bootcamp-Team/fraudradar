---
id: 114
area: geral
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 113
data: 2026-11-16
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 113: o que entrou na main

## Estado encontrado

| Branch | Situação | O que foi feito |
|---|---|---|
| `feat/i18n` (PR #18) | aprovada, CI verde, sem conflito | mergeada (`a89c02a`) |
| `feat/integracao-web-rag` (PR #19, Victor) | 44 arquivos em conflito com a `main`; CI vermelho no `ruff format` | integrada pelo PR #20 (`feat/ai-legal-rag`) |
| `feat/rag-gemini` (Victor) | são os 6 primeiros commits do #19 | entra junto com o #19 |
| `victor` | notebook `lab/FraudRadar_LightGBM.ipynb` (2,8 MB), 117 commits atrás, sem PR | não mergeada |
| `audit/reproducao-lightgbm-v1` (Victor) | 3 scripts de auditoria numa pasta nova `auditoria/`, sem PR | não mergeada |
| `yuji` | fora, a pedido do Pedro | — |
| as demais | já estão na `main` | — |

## Como o #19 entrou

Foi integrado numa branch nova, `feat/ai-legal-rag`, para não mexer na branch do Victor. Os
commits dele entram com a autoria dele, e o #19 aparece como mergeado quando o #20 entrar.

- **`web/`: fica a versão da `main`.** O commit `d081c2c` ("sync frontend") não é um front
  diferente. É a cópia do front do PR #15, que difere só por um fim de linha no
  `assistant.tsx`. A `main` já tem o #16, o #17 e o i18n por cima dele. Com isso caíram os
  conflitos dos 39 arquivos do front.
- **Monitoramento: fica a versão da `main`.** O `906d328` trazia de volta o `recall_series`,
  que o PR #17 tirou das telas de propósito: lê as métricas do lote, feitas com o gabarito. O
  `score_histogram` e o `status_counts` dele já existiam na `main`, com os mesmos campos.
- **`api/routes/ai.py`: o `/chat` do Victor, com `AppError`.** O i18n exige código nos erros
  que chegam à tela (`tests/api/test_i18n_messages.py`). Os 6 erros viraram `ai.chat_alert_route`,
  `ai.chat_personal_data`, `ai.no_legal_sources`, `ai.provider_rate_limited`,
  `ai.provider_unavailable` e `ai.provider_failed`. Os textos em pt-BR e en ficam em
  `web/messages/*/errors.json`. O `detail` em português continua o do Victor, e os testes dele
  seguem valendo.
- **Formatação:** `ruff format` nos 19 arquivos do RAG, num commit `style(ai)` separado. Só
  formatação.
- **Dependências:** o Victor pôs `sentence-transformers` e `google-genai` no grupo `api`. Isso
  leva o torch de CPU para a imagem da API, contra a regra do `AGENTS.md`. Decidi manter, porque
  o chat gera o vetor da pergunta dentro da API (a chave do LLM só fica na API), e atualizei a
  regra com a exceção. Para reverter, seria preciso usar embeddings por API ou tirar a busca
  vetorial do caminho da API.
- **Docs:** o README (rota `/chat` e pastas `ai/` e `rag/`), o `.env.example` (o `LLM_MODEL`
  passa a ser obrigatório para o chat) e a skill de visão geral (as duas cópias) descrevem o chat.

## Achados (não mexidos)

- **Base do RAG:** não há comando para carregar a Lei 9.613 em `rag_documents`; a tabela já
  existe no `db/init/002_tables.sql`. Com ela vazia, o chat responde 503.
- **Configuração:** pela leitura do código, sem `LLM_MODEL` ou sem a chave do Gemini o `/chat`
  responde 500, e não 503. O `ValueError` da configuração atravessa o
  `generate_from_prepared_evidence`.
- **Terraform:** o `infra/terraform-oci/vars.tf` traz o OCID da tenancy e o da imagem como
  padrão, num repositório público. Não são credenciais, mas é melhor que vão para um `.tfvars`
  (o `.gitignore` da pasta já bloqueia esse tipo de arquivo).
- **Registro de prompt:** o #19 não tem nenhum em `docs/vibe-coding/prompts/`.
- **Testes do servidor:** não deu para testar o front contra a API do Victor desta máquina,
  porque a rede bloqueia o domínio dela.

## Front local

O `web/.env.local` (fora do git) recebeu as quatro variáveis que o Pedro passou. O arquivo
anterior ficou em `trash/env-backup/`, também fora do git. O `.env` da raiz, usado pelo
`docker compose`, não mudou.

## Verificação

- `ruff check` e `ruff format --check`: ok.
- `pytest`: 285 passaram e 0 falharam. Os 376 testes de banco foram pulados, porque não havia
  Postgres local; eles rodam no CI do PR #20. Os 30 testes do RAG rodaram sem rede
  (`HF_HUB_OFFLINE=1`).
- `pnpm test` (web): 84 passaram, entre eles o que confere a tradução de todo código do servidor.
- `tests/test_agent_skill.py`: as duas cópias da skill continuam iguais.

## Em aberto

- O merge do PR #20 depende do CI verde.
- As branches `victor` e `audit/reproducao-lightgbm-v1` não têm PR. Se forem entrar, falta
  decidir onde: o `lab/` fica fora do git, e `auditoria/` foge do padrão de nomes em inglês.
- A `docs/bpmn` (registros 111 e 112) continua local, esperando o Pedro olhar os diagramas.
