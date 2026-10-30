---
id: 026
area: backend
autor: Claude Code (PC do Vinicius)
destino: Claude Code (conta 1)
pai: 025
data: 2026-10-29
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 025: ingestão de transações na API

Branch `feat/api-ingestao`, com PR para `feat/api-base` (o PR #1 segue aberto). Sem merge:
um colega revisa.

## O que foi feito

- `POST /ingestao/csv`: multipart, campo `arquivo`, CSV do SAML-D sem rótulos. Valida
  todas as linhas e grava tudo ou nada.
- `POST /ingestao/transacoes`: uma transação em JSON (`PedidoTransacao`, com
  `extra="forbid"` e `strict=True`, espelhando o `.strict()` do zod).
- `/ingestao/conexoes` ficou como estava: lista vazia; cadastro e sincronização em 501.
- `src/fraudradar/dados/ingestao.py`: `ler_csv` e `transacao`, as mesmas regras para a API
  e para o worker.
- `api/repositorios/ingestao.py`: valida o arquivo inteiro antes de tocar no banco, depois
  grava por COPY na transação da requisição; registra `ingestoes` e `auditoria`.
- Esquema: tabela `ingestoes` (o id é o do recibo; status `recebido`) e
  `transacoes.ingestao_id`, NULL na carga do SAML-D e sem FK. Exige `docker compose down -v`.
- `python-multipart` no grupo `api`. O lock foi gerado com o uv 0.11 da imagem, para manter
  a revisão 3.

## Decisões

- **Cabeçalho em qualquer ordem**, com as 10 colunas exatas, como o `validarCabecalhos` do
  front. Coluna de avaliação, faltando, repetida ou desconhecida → 422.
- **Contas**: só dígitos ASCII, sem zero à esquerda, de 1 até o maior BIGINT. O zero à
  esquerda se perderia na coluna numérica. A regra está em `web/CONTRATOS_API.md`.
- **Valor**: finito, arredondado para centavos como o NUMERIC(14,2), de 0.01 a
  999999999999.99; o float do JSON arredonda igual ao texto do CSV.
- **Erros**: 422 no formato do FastAPI (`[{type, loc, msg}]`), até 20, com linha e coluna
  em `loc` e no começo da `msg`.
- **Limite de 20 MiB e 200 mil linhas** → 413. O Starlette lê o multipart antes de
  qualquer dependência (até da autenticação) e não limita tamanho: `CorpoLimitado` conta os
  bytes enquanto chegam. Um teste ASGI mostra que a leitura para no 5º de 101 pedaços.
- **COPY**: 200 mil linhas (17,3 MiB) levaram 1,85–1,93 s de COPY no servidor, numa tabela
  com ~11 mi de linhas (13% dos 15 s do `statement_timeout`); pela API, de ponta a ponta,
  1,6–2,8 s (até 5,5 s com a máquina carregada). INSERT linha a linha foi mais de 2× mais
  lento.

## Achados fora do escopo (relatados no PR)

- `COLUNAS_TRANSACAO` tem 10 colunas, não 11: o prompt 025, o `api/AGENTS.md`, o contrato e
  a mensagem do `validarCabecalhos` diziam 11. Os docs foram corrigidos; a mensagem do front,
  não.
- A prévia do front detecta o separador sozinha (PapaParse), mas a API aceita só vírgula.
- O front não lê `detail` nos erros 413/422 e não checa o tamanho do arquivo antes de enviar.
- `test_sem_supabase_url_503` falhava com `AUTH_DESLIGADA=true` no `.env` local (o próprio
  setup do 025): corrigido no fixture que isola o ambiente.

## Commits

- `83b2cc0` test(api): isola os testes do AUTH_DESLIGADA do .env local
- `c56a7b9` feat(db)!: adiciona ingestoes e a origem de cada transação
- `f20f277` feat(dados): valida transações da ingestão no formato do SAML-D
- `1f9eedd` chore(api): adiciona python-multipart para receber upload
- `6004a1f` feat(api): implementa POST /ingestao/csv e /ingestao/transacoes
- `eb8de54` docs(api): documenta a ingestão, o limite e a regra das contas
- `8c3a7a0` test(api): confere o pedaço exato em que o limite corta o envio

## Gate

Com banco de teste próprio (`fraudradar_ingestao_teste`) e `EXIGIR_BANCO_TESTE=1`:

```
uv run ruff check .          -> All checks passed!
uv run ruff format --check . -> 90 files already formatted
uv run pytest                -> 279 passed (0 skipped)
```

Cada commit passa o gate sozinho (189 → 244 → 279 testes).
