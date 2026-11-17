---
id: 119
area: geral
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 118
data: 2026-11-17
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 118: o que falta no sistema e o estado das branches

Análise feita sobre a `main` de 17/11/2026 (`1fd3b83`). Nenhum código foi alterado.

## BPMN e DER

Não se perderam. Estão na branch `docs/bpmn` (PR #21, aberto), com 23 arquivos em `docs/bpmn/` e
`docs/erd/`. Nunca chegaram à `main`; quem está na `fix/ai-legal-chat-gaps` não vê a pasta. O #21
entra na `main` atual sem conflito.

## Aprovação de PR

O GitHub não exige aprovação: a `main` não tem proteção nem ruleset, e os PRs #21 e #22 estão
mergeáveis. A regra do time é outra: o `CONTRIBUTING.md` diz "Nada direto na `main`: abra PR, CI
verde e um colega revisa".

## Branches fora da `main`

| Branch | O que traz | Situação |
|---|---|---|
| `docs/bpmn` (PR #21) | BPMN e DER | CI verde, sem conflito |
| `fix/ai-legal-chat-gaps` (PR #22) | `rag-load`, 503 sem o Gemini, OCID fora do `vars.tf` | verde na prévia com a `main` nova; falta um nome só para o volume do cache |
| `integration/oracle-vercel-final` (Victor, sem PR) | parecer e chat do alerta | CI vermelho e um bug que dá erro 500 (abaixo) |
| `yuji` | notebooks em `lab/yuji/`, `docs/analysis/`, `docs/graphics/` | 161 commits atrás, CI vermelho; o Pedro decidiu em 16/11 não mergear |
| `victor` | `lab/FraudRadar_LightGBM.ipynb` | `lab/` fica fora do git (`.gitignore`) |
| `audit/reproducao-lightgbm-v1` | 3 scripts em `auditoria/` | sem PR; pasta com nome em português |

Prévia do merge `main` + #22 + #21, feita numa cópia local, sem push:

- `uv lock --check`, `ruff check` e `ruff format --check` passaram;
- `pytest` com Postgres e `REQUIRE_TEST_DB=1`: 686 passaram, nenhum pulado;
- front: `pnpm lint`, `pnpm test` (84 de 84) e `pnpm build` passaram.

O compose dessa prévia fica com dois volumes no mesmo caminho do cache de embeddings:

- `hf_cache` (commit do Victor direto na `main`);
- `hf-cache` (PR #22).

O Compose usa só o último. Antes do merge, deixe um nome só (`hf_cache`, que já existe no servidor).

## A branch do Victor (`integration/oracle-vercel-final`)

A ideia é boa e segue o pedido da frente 3:

1. lê a evidência numa transação curta e a fecha;
2. chama o RAG jurídico;
3. confere as citações;
4. grava o parecer em outra transação.

O que impede o merge:

1. **Erro 500 nos alertas de id curto.** O filtro que impede número de conta no prompt trata o id
   do alerta como segredo e compara pedaços de texto. O id 7 aparece em datas e valores do
   contexto, e o parecer cai antes de chamar o Gemini:
   - `POST /alerts/7/assessment`, `/20` e `/100` responderam 500;
   - o `/882`, que é o id que os testes dele usam, passou dessa etapa;
   - com Postgres, o próprio teste dele falha:
     `tests/api/test_base.py::test_assessment_generates_persists_and_returns_in_detail`;
   - correção mínima: só contas e contrapartes são proibidas, comparadas como número inteiro, não
     como pedaço de texto; e o erro de preparo vira um código, não 500.
2. **`ruff check` com 16 erros.** Entre eles, um import solto no fim de `api/routes/ai.py`. O CI
   para aí e nem roda os testes.
3. **4 códigos de erro sem tradução** em `web/messages/*/errors.json`:
   - `ai.model_not_configured`;
   - `ai.invalid_assessment`;
   - `ai.generation_failed`;
   - `ai.alert_context_mismatch`.

   O `pnpm test` falha (83 de 84). O CI não roda `pnpm test`.
4. **Conflito com o #22 em `api/routes/ai.py`.** Ao resolver, manter o 503 `ai.not_configured` e
   o 502 do #22. A versão dele do `/chat` não trata o `ValueError` e volta a responder 500.
5. **Tipologia continua vazia.** O parecer não preenche `assessments.suggested_typology` nem
   `alerts.typology`.
6. Comentários e docstrings em inglês. A regra do projeto pede português.

Resultado com Postgres: 732 testes passaram e 1 falhou.

## Commits do Victor direto na `main` (16 e 17/11)

São 6 commits sem PR:

- timeout do Gemini de 30 s para 120 s;
- volume `hf_cache`;
- Next 16.4.6;
- seletor de semana no painel;
- upgrade `008`, que aceita a origem antiga `manual`.

O CI da `main` passou. Ficaram para trás:

- `web/src/features/alerts/components/replay-controls.tsx`, que nada importa;
- o README, que não cita o upgrade 008.

## O que falta no sistema

| # | Falta | De quem |
|---|---|---|
| 1 | Parecer e chat do alerta: na `main` ainda respondem 503 | frente 3 (branch acima) |
| 2 | Tipologia prevista: ninguém grava `alerts.typology`; a fila e o rascunho ao COAF mostram "Indefinida" | frente 3 |
| 3 | Regras de cenário: `db/rules/` só tem o README; a evidência "regras" nunca aparece | frente 1 |
| 4 | Base do RAG: só a Lei 9.613; a Circular BCB 3.978/2020 está em `rag/sources.json` sem snapshot; não há tipologias nem manual interno | frente 3 |
| 5 | Notebooks oficiais: `notebooks/` só tem o README; o bootcamp pede limpeza, análise e transformação dos dados | frentes 1, 2 e 3 |
| 6 | Entregáveis: os slides e o documento das etapas não estão no repositório. Nenhum registro de prompt do Victor ou do Yuji em `docs/vibe-coding/prompts/` | frente 5, Victor, Yuji |
| 7 | Produção: no `docker-compose.prod.yml`, o `worker-serve` usa a senha padrão do banco e a api usa `FRAUDRADAR_DB_PASSWORD`. Sem `POSTGRES_PASSWORD` igual no servidor, processar, simular e retreinar ficam na fila. O proxy HTTPS do servidor não está no repositório | Victor |
| 8 | CI: o job web não roda `pnpm test`; `infra/terraform-oci` não é validado; a `main` aceita push direto | frente 5 |
| 9 | README desatualizado: diz que `/ingestion/connections` responde 501, mas as rotas já funcionam; falta o upgrade 008 | frente 5 |
| 10 | Decisões de produto: o mesmo analista que decide comunicar aprova a comunicação ao COAF; gerar parecer não entra na auditoria | Pedro e o time |

## Não verificado

- se os slides e o relatório estão no drive do grupo;
- se o Victor e o Yuji registraram os prompts direto no VibeLog;
- o servidor da Oracle: a rede daqui bloqueia o domínio. O item 7 foi visto no `docker compose
  config` com uma senha de exemplo, não no servidor;
- a qualidade da busca do RAG quando a pergunta é o prompt longo do parecer;
- `terraform validate` em `infra/terraform-oci`.
