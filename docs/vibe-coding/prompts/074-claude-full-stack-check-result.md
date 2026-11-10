---
id: 074
area: geral
autor: Claude Code (conta 1, do Pedro)
destino: Pedro
pai: 073
data: 2026-11-10
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 073: a stack inteira ligada, de ponta a ponta

Nenhum código mudou. Foi uma verificação com a stack real, sem mocks.

## O que foi ligado

- `web/.env.local` (fora do git) passou de `NEXT_PUBLIC_USE_MOCKS=true` para `false`. O Docker
  já montava o front com `false`.
- `docker compose --profile worker build api web worker` e `docker compose up -d api web`, sobre o
  banco que já existia (volume de 09/11, mais novo que a última mudança de esquema e de modelo):
  9,5 milhões de transações, 14 semanas processadas e liberadas, `model_versions = lightgbm_v1`.
- Havia um CSV ingerido pela tela em 09/11 (`ingestion_2023-08-28.csv`, 20.997 linhas) parado em
  `received`. `docker compose run --rm worker replay` processou a semana 28/08 com o LightGBM:
  23.550 contas ativas, 171 alertas, 94 s; a ingestão foi para `completed`. Recall vazio, porque
  essas linhas não têm gabarito.

## Como foi verificado

- `GET /health`: banco e modelo `ok`; LLM `false` (nenhuma chave no `.env`), por isso `degraded`.
- Sem token, `GET /alerts` dá 401 e o front redireciona para `/login`: a autenticação está ligada.
- Rotas de leitura numa cópia da API com `AUTH_DISABLED=true` na porta 8001 (desligada no fim):
  fila, detalhe, grafo e monitoramento com 200 em menos de 20 ms; relatório sem decisão, 404;
  parecer, 503.
- No navegador (Playwright, com a sessão do Supabase do Pedro), contra a API da porta 8000:
  visão geral, botão "Liberar próxima semana" (`POST /replay/next-week` 200, 171 alertas da semana
  28/08 na tela), fila com 18 páginas, detalhe do alerta 3126 com as contribuições SHAP, grafo e
  transações, decisão "Preparar comunicação ao COAF", rascunho em Comunicações e aprovação.
  O `audit_log` gravou `replay`, `decision` e `report_approved` com o nome e o id do usuário do
  JWT. Configurações mostra "Origem dos dados: API de monitoramento". Nenhum erro no console além
  do 503 do parecer.

## Defeitos achados (não corrigidos)

1. **O front esconde a mensagem de erro da API.** `requestJson` em `web/src/lib/api.ts` troca o
   `detail` por "Não foi possível concluir a solicitação (503). Tente novamente.". No parecer, o
   analista vê "tente novamente" em vez de "O assistente de IA ainda não está disponível". O mesmo
   vale para o 409 do replay e os 422/501 da ingestão.
2. **Recall 0% em semana sem gabarito.** A API devolve `recall: 0.0` quando `weekly_batches` não
   tem a métrica (semana 28/08, vinda da ingestão), e o schema do front exige número. A tela diz
   "Recall da fila 0%", como se o modelo tivesse errado tudo. Precisa de `null` no contrato e "—"
   na tela.
3. **Acerto de tipologia sempre 0%.** `alerts.typology` fica nulo até o LLM existir (frente 3), e
   o card mostra 0% em todas as semanas. Mesmo remédio do item 2.

## O que já se sabia e continua igual

- Parecer e chat respondem 503: `src/fraudradar/ai` está vazio (frente 3).
- "Regras acionadas" vem vazio: `db/rules/` só tem o README.
- Metade dos alertas tem score ≥ 0,9995 e aparece como 100,0; a tela já explica que o desempate é
  pela posição na fila.

## Estado deixado

`db`, `api` e `web` no ar. A semana 28/08 está liberada e o alerta 3126 tem decisão e
comunicação aprovada (dados de teste no banco local).
