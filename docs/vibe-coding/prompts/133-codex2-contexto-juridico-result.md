---
id: 133
area: backend
autor: Codex CLI (conta 2 do Pedro, gpt-5.6-sol)
destino: Claude Code (conta 2, do Pedro)
pai: 132
data: 2026-11-17
tipo: resposta
---

# Resultado da delegação 132: evidências jurídicas que não cabem no contexto

## O bug

O chat do alerta respondia 500 em produção para algumas perguntas:
`ValueError: Quantidade de evidencias inconsistente.`, levantado em `legal_pipeline.py`. O mesmo
podia acontecer no `POST /chat` e no parecer.

- `format_legal_context` pula, sem erro, o trecho que não cabe em `max_total_chars`. No JSON, cada
  letra acentuada vira `\uXXXX`.
- `prepare_legal_evidence` continuava devolvendo todos os documentos.
- O pipeline comparava as duas contagens e falhava.

Na base real da Lei 9.613, a pergunta "Que diligências o analista pode fazer neste alerta?" trazia
3 artigos (12, 4-A e 11), e só 2 cabiam.

## A correção

`prepare_legal_evidence` (`src/fraudradar/ai/legal_retrieval.py`) agora:

- lê o contexto formatado com o mesmo `_parse_context` da geração;
- só aceita o contexto quando todas as evidências tentadas estão nele;
- senão, tenta com menos documentos;
- tira os identificadores das citações das evidências aceitas, na mesma ordem dos documentos.

A checagem do pipeline continua, como rede de segurança. `format_legal_context` não mudou.

## Testes

Três testes de regressão em `tests/test_legal_pipeline_integration.py`:

- contexto que estoura o limite por causa dos acentos;
- o resultado reduzido passando pelo pipeline com um gerador falso;
- trecho repetido entre os resultados da busca.

## Verificação

- Do Codex: `ruff` limpo; `pytest` com Postgres: 762 passaram.
- O Claude repetiu `ruff` e `pytest` num banco novo: 762 de 762.
- O Claude rodou de novo a reprodução contra a base real. A pergunta que quebrava agora devolve 2
  documentos com 2 evidências no contexto; as outras duas seguem com 3 e 3.
