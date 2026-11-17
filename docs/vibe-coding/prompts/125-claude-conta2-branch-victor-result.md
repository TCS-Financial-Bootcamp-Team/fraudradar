---
id: 125
area: geral
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 120
data: 2026-11-17
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 120 (e do 126): branch do Victor corrigida, infra e markdown

## Docker

Desligados os Supabase locais do `obralog-v2` e do `nexion` (11 containers cada). O
`fraudradar-worker-serve-1` também foi parado: ele voltou sozinho quando o Docker subiu e ficou
reiniciando sem o banco. O PR de infra corrige isso.

## Três PRs

Os PRs #21 e #22 já tinham sido aprovados e mergeados pelo Yuji.

| PR | Branch | O que traz | Quem escreveu |
|---|---|---|---|
| #23 | `fix/infra-compose-ci` | um volume para o cache de embeddings, `restart` no banco, senha de produção no `worker-serve`, `pnpm test` no CI, README e um componente morto a menos | agy (registros 123 e 124) |
| #24 | `fix/web-ai-markdown` | markdown do parecer e do assistente formatado, sem HTML bruto | agy (registros 127 e 128) |
| este | `feat/ai-alert-assessment` | o commit do Victor (parecer e chat do alerta) sobre a `main`, corrigido | Codex na conta 2, em três rodadas (registros 121 e 122) |

A branch do Victor (`integration/oracle-vercel-final`) ficou intacta. A branch nova parte do commit
dele (`abc3f3b`), que continua no histórico com a autoria dele.

## Correções sobre a branch do Victor

1. **Erro 500 em alertas de id curto.** O guarda de privacidade tratava o id do alerta como
   segredo e comparava pedaços de texto. Agora só as contas são proibidas, comparadas como número
   inteiro.
2. **Conflito com o #22**, com um tradutor de erro só para as três rotas, e a configuração do
   Gemini checada antes do banco.
3. **Erros com código e tradução:** `ai.context_blocked`, `ai.question_too_long`,
   `ai.alert_context_mismatch` e `ai.invalid_assessment`. Gemini fora do ar dá 503
   `ai.provider_unavailable`.
4. **Tipologia sugerida.** O parecer termina com um dos 17 códigos do SAML-D, que vai para
   `assessments.suggested_typology`, e o rótulo em português vai para `alerts.typology`. A
   tipologia anterior não volta ao LLM.
5. **Auditoria.** `assessment_generated` em `audit_log`, com o analista.
6. **Lugar do código.** A lógica do LLM mora em `src/fraudradar/ai/alert_assessment.py`, como
   pede o `api/AGENTS.md`.
7. **Busca jurídica do parecer.** Usa uma pergunta fixa, medida contra a base real da Lei 9.613:
   traz os arts. 11 e 10. A pergunta curta que o Claude tinha sugerido antes trazia os arts. 14 e
   15. No chat do alerta, a busca usa só a pergunta do analista.
8. **Rascunho ao COAF em texto simples** (pedido 126).
9. **Qualidade.** `ruff` limpo e comentários em português.

## Verificação

- Branch do parecer, num banco novo e sem nada pulado: `uv lock --check`, `ruff check`,
  `ruff format --check`, `pytest` com Postgres (759 de 759), `pnpm lint`, `pnpm test` (84 de
  84) e `pnpm build`.
- PR #23: CI verde (Python, web com `pnpm test`, Terraform com o `terraform-oci`, preview da
  Vercel).
- PR #24: `pnpm lint`, `pnpm test` (93 de 93) e `pnpm build`.

Não verificado:

- o parecer com o Gemini de verdade: não há chave no `.env` desta máquina;
- as telas num navegador;
- o servidor da Oracle.

## Para o time

- Revisar e mergear os PRs #23, #24 e o do parecer. São independentes: os trechos do README que
  #23 e o do parecer mudam ficam em linhas diferentes.
- **Victor, depois do merge no servidor:** testar o parecer com a chave; apagar o volume antigo
  `hf-cache` quando o `hf_cache` estiver com o modelo; conferir que o `worker-serve` sobe com a
  senha de produção.
- **Continuam faltando** (frentes 1 e 3 e entrega):
  - regras em `db/rules/`;
  - a Circular 3.978 revisada na base do RAG;
  - os notebooks oficiais;
  - os slides e o documento das etapas;
  - os registros de prompt do Victor e do Yuji.
- **Decisões do Pedro:**
  - proteger a `main` no GitHub (exigir PR e CI verde), já que o `CONTRIBUTING.md` pede isso e
    houve push direto;
  - se o mesmo analista pode decidir comunicar e aprovar a comunicação ao COAF.
