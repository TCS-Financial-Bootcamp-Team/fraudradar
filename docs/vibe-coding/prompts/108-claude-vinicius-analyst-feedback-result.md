---
id: 108
area: geral
autor: Claude Code (PC do Vinicius)
destino: Pedro
pai: 107
data: 2026-11-12
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 107: retorno dos analistas no retreino e saída do recall das telas

Branch `feat/analyst-feedback`, criada de `origin/feat/external-datasets` (`c9d3375`), como o 107
pede. O Vinicius pediu "Execute o prompt 107". São 13 commits, mais o deste registro. Não houve
rebase nem force-push, e não abri PR. O 107 diz que o PR #16 ainda estava aberto, mas ele já foi
para a `main` em 12/11. A base do PR desta branch pode ser a `main` direto: a branch é a `main`
mais o registro 107 e estes commits.

A explicação para o time está em `docs/analyst-feedback.md`.

## O que mudou

| Passo | Commits | O que mudou |
|---|---|---|
| 1. Esquema, motivo e rótulos | `badaefd`, `281fcd8`, `9964615` | `decisions.archive_reason`, `alerts.origin`, `analyst_labels`, `processing_settings.exploration_per_week` (002 e 004) e `db/upgrades/006_analyst_feedback.sql`; arquivar exige o motivo (422 sem ele e 422 com motivo em outra decisão); o rótulo é gravado na transação da decisão, e a última decisão troca ou apaga o rótulo |
| 2. Amostra de controle | `547b81b`, `a992d9d` | o worker sorteia `exploration_per_week` contas fora da fila por semana (semente do conjunto e da semana); elas ficam fora das contas suspeitas, das contagens e da taxa de alerta do monitoramento, de `/weeks` e das métricas do worker; a fila as mostra no fim, e `GET /alerts` ganha `origin` |
| 3. Retreino com retorno e trava | `8cbf447`, `3a3989c`, `71070f0` | divisão do retorno, rótulo por transação, pesos (gabarito sempre ganha), blocos `feedback` e `comparison` na ficha; `POST /train` com `use_feedback`/`include_simulated` e 409 abaixo de 50 rótulos ou sem uma das classes; promoção 409 quando a trava falha |
| 4. Analista simulado e experimento | `75be0fb`, `416ea9a` | `python -m worker simulate-analyst` (com `--undo`) e `python -m worker feedback-eval` |
| 5. Resumo e saída do recall | `83a0d37` | `GET /feedback/summary`; `GET /monitoring` perde `recall`, `typology_accuracy` e `recall_series` |
| 6. Front | `a6cd0f3` | motivo do arquivamento, selo e filtro da amostra de controle, "Precisão confirmada" na visão geral, seção "Retorno dos analistas" no monitoramento, Configurações > Modelo com a validação lado a lado com a ativa, a trava e a escolha do retorno no treino; mocks atualizados |
| 7. Documentação | `adbd4f3` | `docs/analyst-feedback.md`; README, `docs/model.md`, `docs/external-data.md`, glossário, `AGENTS.md`, `api/AGENTS.md` e a skill de visão geral (as duas cópias iguais) |

## Verificação

Os comandos do 107, com duas diferenças desta máquina: o Postgres do projeto está na porta 5433
(a 5432 é de outro projeto do Vinicius), e não há Node no Mac, então o front rodou num contêiner
`node:24-alpine` sobre uma cópia da árvore (sem `.env`).

| Comando | Resultado |
|---|---|
| `uv run ruff check . && uv run ruff format --check .` | limpo (265 arquivos) |
| `TEST_DATABASE_URL=...@127.0.0.1:5433/fraudradar_vinicius_test REQUIRE_TEST_DB=1 uv run --group api --group ml pytest` | 613 passed, 0 skipped (eram 543 antes) |
| `pnpm install --frozen-lockfile && pnpm lint && pnpm test && pnpm build` | lint limpo; 73 testes, 73 passaram, 0 pulados; build ok (com a checagem de tipos) |

Os testes novos cobrem o que o 107 lista: motivo e rótulos (incluindo arquivamento antigo sem
motivo); amostra de controle (k contas fora da fila, mesma escolha para o mesmo conjunto e semana,
0 desliga, fora das contas suspeitas, das contagens e das métricas, decididas mantidas no
recálculo); retreino com retorno no dado sintético (corte que recua para sobrarem 4 semanas de
teste, período aberto e rótulos depois do corte fora, simulação fora, regra 0/1, gabarito ganha e
conflitos contados, peso só nas linhas de treino, recusa abaixo do mínimo, bloco `feedback`); trava
(a versão ativa medida nas mesmas semanas confere com um cálculo feito por fora, 409 quando falha,
ficha antiga promove como antes); analista simulado (só alertas sem decisão de semanas fechadas,
taxas de erro e de "sem evidência" com semente fixa, nunca toca decisão humana, `--undo`); o
`feedback-eval` grava as duas medidas; `/monitoring` sem recall; `/feedback/summary` com
`low_sample`; a API nunca consulta `ground_truth` (os testes de guarda cobrem as rotas novas). No
front: o motivo é exigido só ao arquivar, as telas de operação não têm recall, e a seção do modelo
mostra a comparação, a trava e o botão de promover desligado.

**`006` duas vezes**, em dois bancos de rascunho:

- banco criado com o `db/init` do commit base (`c9d3375`), com um conjunto externo e decisões
  antigas: depois da 1ª e da 2ª aplicação, o esquema e os rótulos ficam iguais, e o esquema fica
  igual ao de um banco novo criado com o `db/init` desta branch;
- cópia do banco de desenvolvimento do Vinicius (SAML-D completo, 9.504.852 transações, 3.125
  alertas e 2 decisões reais): 0,1 s por aplicação, o mesmo esquema depois das duas, igual ao do
  banco novo. A decisão antiga de comunicar virou rótulo de lavagem confirmada; a de aprofundar,
  nenhum.

O banco de desenvolvimento original **não** foi alterado.

## O experimento no SAML-D

Rodado na cópia do banco, com a máquina do Vinicius (16 GB de RAM):

1. As semanas de 29/05 a 10/07 foram reprocessadas com o código novo, para ganhar a amostra de
   controle (51 s; 4,2 GB no pico). Na primeira tentativa, o worker recusou reprocessar, porque
   as semanas tinham sido liberadas no replay antigo. Só na cópia, limpei o `released_at`
   (legado) dessas semanas. A semana de 22/05 tem uma decisão real e ficou como estava.
2. `simulate-analyst --from 2023-05-22 --to 2023-07-16` (10% de erro, 20% sem evidência,
   semente 108): 1.850 alertas decididos (1.815 da fila, 35 da amostra), 1.598 comunicados, 202
   falsos positivos confirmados e 50 sem evidência suficiente; 215 conclusões trocadas de
   propósito. Ficaram 1.800 rótulos.
3. `feedback-eval --include-simulated`: treino até 16/07, validação desde 19/06, teste de 17/07 a
   23/08 (6 semanas). 856 rótulos pesaram no treino (765 de lavagem, 91 de falso positivo; 845 da
   fila e 11 da amostra), 944 caíram na validação e 0 ficaram reservados. 2.382 transações
   cobertas: 1.396 com peso 3 e 986 em conflito com o gabarito. Levou 423 s, com 5,3 GB no pico.

| Medida no teste | Controle (só gabarito) | Com o retorno | Diferença |
|---|---|---|---|
| PR-AUC | 0,8965 | 0,8975 | +0,0010 |
| Recall com 0,13% de falso positivo | 89,69% | 90,01% | +0,32 p.p. |
| Fila com corte: recall | 93,05% | 92,83% | −0,22 p.p. |
| Fila com corte: precisão | 100,0% | 100,0% | 0 |
| Inocentes por semana | 0,0 | 0,0 | 0 |
| Árvores | 1.578 | 814 | |

Por tipologia, só `smurfing` (74,1% → 76,8%) e `gather_scatter` (94,4% → 95,8%) mudaram.

**O retorno não mudou o modelo de forma mensurável.** As diferenças estão no ruído de uma rodada
com uma semente só. No SAML-D o gabarito cobre tudo e sempre ganha, então o retorno só muda pesos.
São 856 rótulos contra milhões de transações, e mais da metade caiu na validação, sem peso. Esses
números não se comparam com os da v1 (95,1% de recall da fila): o período de teste é outro.

Duas medidas a mais, feitas por fora:

- **Os conflitos vêm da regra das 5 transações.** Com o analista certo, o falso positivo
  confirmado dá 0% de conflito. Já a lavagem confirmada dá 45% com as 5 transações de maior nota
  (946 de 2.118), 33% com 3 e 0% com 1. Com analista errado, o falso positivo dá 21% de conflito e
  a lavagem dá 100%. Com gabarito o conflito não faz mal: vale o gabarito, com peso 1.
- **Amostra de controle.** Nenhuma das 35 contas sorteadas lavou de verdade (a maior nota foi
  0,0028). As 4 "lavagens achadas fora da fila" da demonstração são erros de propósito do analista
  simulado.

## Decisões que tomei

1. **A seção do modelo foi para Configurações.** O 107 a chama de "Configurações > Modelo", mas
   ela estava no Monitoramento. Mudei de lugar, para a validação contra o gabarito sair de vez
   das telas de operação.
2. **Os indicadores do Monitoramento.** No lugar do recall e do acerto de tipologia entraram
   "Revisados" e "Comunicações aprovadas", que já vinham na API, e a seção "Retorno dos
   analistas". A precisão confirmada conta também os rótulos do analista simulado, e a tela avisa
   quando há rótulo simulado.
3. **O sorteio da amostra.** Cada conta ganha um número de sorteio fixo (um misturador SplitMix64
   da conta com a semente do conjunto e da semana), e entram as de menor número. O recálculo do
   período aberto repete as contas. Se uma conta da amostra já decidida entrar na fila no
   recálculo, ela fica, e a semana passa a ter uma conta a mais na amostra.
4. **Período fechado.** É a semana anterior à da transação mais recente, o mesmo critério do
   worker. A API e o worker usam a mesma função (`fraudradar.model.feedback.open_week`).
5. **O worker confere o retorno de novo depois do corte.** A API conta os rótulos de todas as
   semanas fechadas. Se, depois do corte, sobrarem menos de 50 nas semanas de treino (o resto na
   validação ou no teste), o trabalho falha com o motivo em português.
6. **Transação coberta sem gabarito.** Só entra a de rótulos das semanas de treino, e ela entra
   também no histórico das variáveis. No controle do experimento fica de fora.
7. **Dois rótulos que discordam na mesma transação** (as duas contas dela rotuladas): fica a
   lavagem confirmada.
8. **O período da trava.** É o teste da versão nova, tirando as semanas que a ativa viu no treino
   quando ela treinou no mesmo conjunto. Sem período em comum, a trava bloqueia com o motivo. A
   comparação é contra a versão ativa **no momento do treino**: se outra versão for promovida
   depois, a trava não é recalculada. A tela mostra com qual versão a comparação foi feita.
9. **`created_at` da ficha com fuso.** Serve para os "novos desde a versão ativa". Ficha antiga,
   sem fuso, vale no fuso do servidor da API.
10. **`model_input` foi para `fraudradar.model.scoring`.** A trava mede a versão ativa como o lote
    dá as notas, e o pacote não pode importar do worker. O worker passou a usar o de lá.
11. **O `006` também rotula decisões antigas.** A última decisão de comunicar de cada alerta vira
    lavagem confirmada. Arquivamento antigo não tem motivo e não vira rótulo.
12. **O analista simulado.** O `--undo` acha as decisões dele pelo nome `analista-simulado`. Alerta
    sem transação rotulada fica sem decisão. `--from` e `--to` aceitam qualquer data: vale a
    segunda-feira da semana.
13. **Testes do front com `node:test`.** O 107 fala em vitest, mas o projeto não tem vitest.

## O que fica em aberto

- **Conferência visual.** O app exige login no Supabase mesmo com mocks, e o Claude não tem
  credencial. As telas foram verificadas por testes e pelo build, não no navegador: falta a
  revisão do Vinicius ou do Pedro.
- **Validação sem peso.** As 4 semanas de validação nunca recebem peso. Na demonstração, foram
  944 dos 1.800 rótulos. Para o retorno pesar inteiro, a validação teria de vir depois da última
  semana com retorno, o que pede 8 semanas com gabarito depois dela. Fica para o Pedro decidir.
- **`FEEDBACK_POSITIVE_TOP = 5`.** Só é seguro enquanto o retreino exigir gabarito. Sem
  gabarito, 45% das transações rotuladas como lavagem estariam erradas; aí seria melhor usar só
  a de maior nota ou deixar o analista marcar as transações.
- **Retreino pela API no SAML-D completo.** O trabalho `train` com `use_feedback` não rodou com o
  SAML-D completo, só o `feedback-eval`, que treina do mesmo jeito. A trava foi verificada no
  dado sintético.
- **Banco de cada um.** O time precisa aplicar o `006` (ou `docker compose down -v`) e
  reconstruir `api`, `web` e `worker-serve`. No banco de desenvolvimento do Vinicius o `006` não
  foi aplicado; as semanas antigas dele não ganham amostra de controle sem reprocessar, e o worker
  recusa reprocessar as que foram liberadas no replay antigo.
- **Arquivos locais da rodada.** O resultado do experimento ficou em
  `models/saml-d/feedback-eval-20261112-142140.json`, fora do git. A cópia do banco
  (`fraudradar_feedback_copy`, cerca de 3,5 GB no volume do Docker) continua lá para conferência;
  pode ser apagada.
