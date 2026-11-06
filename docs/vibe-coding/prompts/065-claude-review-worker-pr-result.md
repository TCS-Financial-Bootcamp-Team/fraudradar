---
id: 065
area: backend
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 064
data: 2026-11-06
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 064: revisão e merge do PR #10 (worker)

O PR do Vinicius cumpre o pedido 061. A revisão achou um defeito que não aparece com o SAML-D
(semana com fila vazia derrubava o lote) e um ponto da seção 5 do pedido que faltava (ficha fora de
UTF-8 dava traceback). Os dois foram consertados na própria branch `feat/worker-batch`, com teste,
antes do merge. Nenhuma delegação para outra IA.

## Consertos

- **Semana com fila vazia.** Sem conta acima do corte, `queue.contributions` chamava o LightGBM com
  zero linhas e o lote caía com `ValueError`. As 14 semanas do teste não passam por isso (a menor
  fila tem 119 alertas), mas um envio pequeno pela API passa: a semana nunca ganharia lote e o
  `replay` ficaria preso nela. Agora a semana é gravada com zero alertas.
- **Ficha fora de UTF-8.** Quem treinou no Windows antes do PR #8 tem a ficha em cp1252 (é o caso da
  máquina do Pedro). O worker dava `UnicodeDecodeError`; agora sai com código 1 e diz o que rodar.

Os dois testes novos ficaram vermelhos antes do conserto. O da fila vazia também cai quando o
conserto é retirado.

## Como foi verificado

Tudo em um worktree descartável e em um Postgres próprio (`pgvector/pgvector:pg17`, porta 5544), sem
tocar no volume `fraudradar_pgdata`. Windows 11, 32 GB de RAM.

| Verificação | Resultado |
|---|---|
| `uv lock --check`, `ruff check`, `ruff format --check` | ok |
| `REQUIRE_TEST_DB=1 pytest` antes dos consertos | sem falhas nem pulados; o CI do PR deu 370 passed |
| `REQUIRE_TEST_DB=1 pytest` depois dos consertos | 372 testes, 0 falhas, 0 pulados |
| 14 mutações no worker (histórico, CAIXA, max do score, corte, categorias, identidade, ids, proteções do `--force`, semana do treino, métricas, países, ingestão, auditoria) | as 14 derrubaram algum teste |

**SAML-D inteiro:**

| Passo | Tempo | Pico de memória do processo |
|---|---|---|
| `worker load` | 398 s | 1,9 GB (amostrado a cada 0,7 s) |
| `worker backfill` | 148 s | 6,2 GB (amostrado; a memória disponível na máquina caiu a 2,5 GB) |

A carga gravou 9.504.852 transações e linhas de gabarito, 855.460 contas, nenhuma linha do CAIXA, e a
identidade ficou em 9.504.852. Os números por semana são os do registro 063.

**Comparação com a ficha v1, em SQL escrito à parte** (sem passar por `worker/metrics.py`):

| Fila com corte | SQL da revisão | Ficha |
|---|---|---|
| Recall | 95,0830% | 95,0830% |
| Precisão | 99,0080% | 99,0080% |
| Contas por semana | 223,2143 | 223,2143 |
| Inocentes por semana | 2,2143 | 2,2143 |

A fila refeita a partir dos scores gravados tem as mesmas contas da fila gravada. Em 18 posições a
ordem difere porque a fila decide em float64 e o banco guarda REAL: há 899 empates em REAL e nenhuma
inversão de score. Também deram zero: alerta ou conta do CAIXA, score abaixo do corte, posição com
buraco, alerta sem evidência, contribuição incompleta e `total_amount`/`transaction_count`
divergentes da soma em `transactions`. Há um score por transação do teste (2.757.347) e 14 linhas de
auditoria.

**CLI:** `--force` em semana liberada, data que não é segunda e semana do treino saem com código 1 e
mensagem clara; semana já processada, `replay` sem próxima semana e `load` repetido saem com 0.

**API real** (`AUTH_DISABLED=true`): `POST /replay/next-week` liberou 2023-05-22 com 166 alertas;
`GET /alerts` veio em ordem, com `queue_position` e tipologia "Indefinida"; `GET /alerts/{id}` trouxe
6 contribuições; o grafo veio com 5 nós e 4 arestas; `GET /monitoring` mostrou o recall gravado
(0,9879). Nenhum erro no log da API.

## O que esta revisão não refez

- `docker compose run worker backfill`: a imagem não foi construída aqui. Li o `Dockerfile` e o
  `.dockerignore` (a pasta `db/rules` entra na imagem); o resultado no Docker é o do registro 063.
- Comparação transação a transação com o pipeline do treino: é a do registro 063. Aqui a conferência
  foi do agregado e da fila.
- `pnpm lint`, `pnpm test` e `pnpm build` locais: nada em `web/` mudou e o job `web` do CI rodou.
- Front logado e prints (seção 9, item 4 do 061): continuam em aberto (ver abaixo).

## O que o time precisa fazer depois do merge

- O que já está no registro 063: `docker compose build worker`, preparar o banco da demo e rodar os
  testes com o grupo `ml`.
- Quem treinou no Windows antes do PR #8: treinar de novo, ou o worker recusa a ficha com a mensagem
  nova.
- No Windows, use `127.0.0.1` em vez de `localhost` no `TEST_DATABASE_URL` quando o Postgres escuta
  só em IPv4: com `localhost`, a suíte passou de 10 minutos sem terminar; com `127.0.0.1`, levou 46 s.

## Em aberto

- **Prints do front logado**: falta alguém com usuário do Supabase abrir a fila, um detalhe e o
  monitoramento, com `NEXT_PUBLIC_USE_MOCKS=false`, e anexar os prints.
- **Tipo de `detail` nas regras (frente 1)**: o `db/rules/README.md` pede JSONB. Texto, JSONB e nulo
  funcionam; `numeric` ou `date` param o lote com `TypeError`, sem dizer qual arquivo falhou, e nada é
  gravado. Quem escrever regra com número deve usar `to_jsonb(...)`.
- **Memória**: o backfill deixou a máquina com 2,5 GB disponíveis, mesmo com 32 GB, por causa do
  Docker e das IDEs abertas. Antes de rodar o lote, feche o que puder.
- Os demais pontos em aberto são os do registro 063.
