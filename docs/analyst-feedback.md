# Retorno dos analistas no retreino

Quando o analista decide um alerta, essa decisão pode ensinar o modelo. A ideia veio do professor:
se o analista vê que um alerta é um falso positivo (a conta não lava dinheiro), o sistema guarda
isso e usa no próximo treino. Este documento explica como o FraudRadar faz isso sem piorar o modelo
sem ninguém perceber.

Decisões do Pedro (registros 107 e 108): fazer a versão completa, e tirar o recall das telas de
operação, porque uma plataforma de verdade não tem gabarito para medi-lo. As outras escolhas são
técnicas e podem ser revistas; estão no fim.

Termos usados aqui:

- **gabarito**: a resposta certa do SAML-D (`Is_laundering`), que diz quais transações são
  lavagem. Um banco de verdade não tem gabarito.
- **rótulo**: a resposta "é lavagem" (1) ou "não é" (0) que o modelo usa para aprender.
- **recall da fila**: das contas que lavaram na semana, quantas entraram na fila.
- **precisão confirmada**: dos alertas da fila que os analistas concluíram, quantos eram lavagem.
- **PR-AUC**: uma nota de 0 a 1 de quão bem o modelo põe as lavagens no topo; quanto maior, melhor.

## Por que não dá para fazer "arquivou = inocente, retreina"

Do jeito óbvio, o modelo piora em silêncio. São quatro problemas, e cada regra do sistema existe
para neutralizar um deles:

| Problema | O que acontece | A regra que neutraliza |
|---|---|---|
| Arquivar não é "não é lavagem" | O analista arquiva por falta de prova ou de tempo, não só porque a conta é inocente. | Ao arquivar, o motivo é obrigatório. Só "falso positivo confirmado" vira rótulo 0; "sem evidência suficiente" não vira rótulo nenhum. |
| O modelo só aprende com o que ele mesmo escolheu | O analista só vê o que já está na fila. Se o modelo deixou passar uma lavagem, ninguém a rotula, e retreinar só com a fila empurra o recall para baixo sem que se veja. | A **amostra de controle**: toda semana, algumas contas são sorteadas fora da fila e revisadas como qualquer alerta. Além disso, o gabarito sempre ganha do rótulo do analista, e toda versão nova passa por uma **trava de promoção**. |
| Poucos rótulos | Algumas centenas de decisões contra milhões de transações. | O retreino continua só em conjunto com gabarito (decisão 5 do Pedro, `docs/external-data.md`); o retorno é um sinal a mais, com peso, nunca substitui o gabarito. É preciso ter pelo menos 50 rótulos de semanas fechadas, das duas classes. |
| Unidades diferentes | O analista decide a conta na semana; o modelo dá nota a cada transação. | Uma regra fixa leva o rótulo da conta às transações (seção "Do alerta às transações"). |

## O que vira rótulo

Vale a **última** decisão de cada alerta: uma decisão nova troca ou apaga o rótulo da anterior. O
rótulo fica numa tabela própria, `analyst_labels`, e nunca se mistura com o gabarito
(`ground_truth`).

| Decisão do analista | Rótulo |
|---|---|
| Comunicar ao COAF | 1, lavagem confirmada |
| Arquivar, motivo "Falso positivo confirmado" | 0, falso positivo confirmado |
| Arquivar, motivo "Sem evidência suficiente" | nenhum |
| Aprofundar | nenhum (a análise não terminou) |
| Arquivamento antigo, de antes do motivo obrigatório | nenhum |

Cada rótulo guarda também a origem do alerta (`model` = fila do modelo, `exploration` = amostra
de controle) e a fonte (`analyst` = uma pessoa, `simulated` = o analista simulado da
demonstração).

## Amostra de controle

Toda semana, o worker sorteia algumas contas ativas que **não** entraram na fila, todas com a mesma
chance, sem olhar a nota. Elas viram alertas com a origem `exploration`, a nota de verdade (baixa)
e as mesmas evidências de qualquer alerta. Na fila da semana, aparecem no fim com o selo discreto
"Amostra de controle".

- Quantas por semana: "Amostra de controle por semana" em Configurações > Processamento (padrão 5,
  de 0 a 50; 0 desliga).
- O sorteio repete as mesmas contas para o mesmo conjunto e a mesma semana. Assim, quando o
  período aberto é recalculado, a amostra não muda à toa, e uma conta da amostra que já tem decisão
  fica como está.
- Essas contas não são suspeitas: ficam fora da lista de contas suspeitas, das contagens e da taxa
  de alerta do monitoramento e das métricas do worker.
- O que a amostra mede: das contas sorteadas que os analistas revisaram, quantas eram lavagem. É a
  "lavagem encontrada fora da fila", o único jeito de uma plataforma real estimar o que o modelo
  deixa passar.

## O retreino com o retorno

Em Configurações > Modelo, "Treinar nova versão" pergunta se o retorno dos analistas entra (e,
quando existe, o retorno simulado). Com o retorno:

1. **Só semanas fechadas.** O período aberto ainda muda; os rótulos dele ficam de fora.
2. **Onde corta o treino.** O retorno vem das semanas em que o modelo já estava em uso, depois do
   treino oficial. Com o corte oficial, todo ele cairia no teste. Por isso o treino vai até o
   domingo da última semana com retorno, desde que sobrem pelo menos 4 semanas com gabarito depois,
   para medir a versão. Se não sobrarem, o corte recua, e o retorno depois dele fica "reservado
   para o teste". A validação continua sendo as últimas 4 semanas do treino.
3. **Do alerta às transações.** Falso positivo confirmado: todas as transações da conta na semana
   recebem 0. Lavagem confirmada: as 5 transações da conta na semana com maior nota do modelo,
   as que o analista viu como evidência, recebem 1. Transações de simulação nunca entram. No
   depósito e no saque em espécie, a conta só cobre a transação pelo lado dela (o outro lado é o
   CAIXA, como no modelo).
4. **O gabarito sempre ganha.** A transação em que o analista concorda com o gabarito pesa 3 no
   treino (falso positivo confirmado é o caso difícil que o modelo errou; lavagem confirmada é o
   que ele não pode perder). Se o analista discorda, vale o gabarito, com peso 1, e isso conta como
   conflito. Validação e teste ficam só com o gabarito e sem peso.

Exemplo no SAML-D, com retorno de 22/05 a 16/07/2023: treino até 16/07, validação de 19/06 a
16/07, teste de 17/07 a 23/08. Os rótulos de 22/05 a 18/06 pesam no treino; os de 19/06 a 16/07
caem na validação e não pesam.

A ficha da versão (`models/<conjunto>/lightgbm_vN.json`) ganha o bloco `feedback`: quantos rótulos
pesaram (por classe, fonte e origem), quantos caíram na validação ou ficaram reservados, quantas
transações foram cobertas, quantas pesaram e quantas deram conflito, e a divisão usada.

## Trava de promoção

Vale para **toda** versão nova, com retorno ou sem. No fim do treino, o worker também dá nota com a
versão ativa nas mesmas semanas de teste da versão nova, com a ordem das variáveis, o corte e o
tamanho de fila da ficha dela. Se a ativa treinou no mesmo conjunto, as semanas que ela já viu no
treino ficam fora. Assim as duas são medidas fora da amostra, nas mesmas semanas.

A ficha guarda o bloco `comparison` com as duas medidas (PR-AUC, recall e precisão da fila,
inocentes por semana). A versão nova passa se achar, na fila, no máximo 1 ponto percentual a menos
de contas lavadoras que a ativa. Se não passar, a tela mostra "Bloqueada: acha X p.p. menos
lavadoras na fila que a versão ativa", e a promoção responde 409 com o motivo. Ficha antiga, sem
comparação, promove como antes.

## O que saiu das telas e o que entrou

- **Saiu**: o recall da fila, a série do recall e o acerto de tipologia da visão geral e do
  monitoramento. O worker continua gravando essas métricas no lote, para a avaliação de
  desenvolvimento.
- **Entrou**: na visão geral, "Precisão confirmada" (dos alertas da fila que os analistas
  concluíram, quantos eram lavagem), com os números por trás e a evolução por semana. No
  monitoramento, a seção "Retorno dos analistas": rótulos por classe, fonte e origem, a precisão
  confirmada por semana, a lavagem achada fora da fila, os rótulos novos desde o treino da versão
  ativa e se o conjunto já pode retreinar com o retorno. Percentual calculado sobre menos de 20
  casos vem marcado como "amostra pequena".
- **Ficou, renomeado**: em Configurações > Modelo, a tabela de versões virou "Validação no período
  de teste (dados rotulados)". Bancos também validam modelos assim, e é com ela que se decide a
  promoção. A seção do modelo saiu do monitoramento para Configurações.

## Analista simulado e o experimento honesto

O SAML-D não tem decisões de analista. Para demonstrar e medir, há dois comandos do worker:

- `python -m worker simulate-analyst --dataset saml-d --from 2023-05-22 --to 2023-07-16` decide pelo
  gabarito os alertas **sem decisão** das semanas fechadas do intervalo, das duas origens: comunica
  a conta que lavou na semana e arquiva as outras como falso positivo. Para parecer um analista de
  verdade, ele erra de propósito (`--error-rate`, 10% por padrão) e às vezes arquiva "sem evidência
  suficiente" (`--insufficient-rate`, 20%). Grava as decisões com o analista `analista-simulado` e
  a justificativa "Decisão simulada a partir do gabarito (demonstração).", não cria rascunho ao COAF
  e nunca toca em alerta que já tem decisão. `--undo` desfaz tudo.
- `python -m worker feedback-eval --dataset saml-d --include-simulated` treina dois modelos com a
  **mesma** divisão do retorno, o mesmo dado e os mesmos parâmetros: o controle só com o gabarito e
  o tratamento com o gabarito e os pesos do retorno. A diferença entre os dois é o efeito do
  retorno, separado do efeito de treinar com semanas mais recentes (que os dois têm). Grava
  `models/saml-d/feedback-eval-<data e hora>.json` e não registra versão.

Os dois leem o gabarito, como `worker/labels.py` e `worker/metrics.py`; o modelo continua sem lê-lo
para dar nota, e a API também.

## Como demonstrar

```bash
# banco que já existia: aplique a atualização do esquema (README, "Atualizar um banco que já existia")
uv run --group ml python -m worker simulate-analyst --dataset saml-d --from 2023-05-22 --to 2023-07-16
uv run --group ml python -m worker feedback-eval --dataset saml-d --include-simulated
```

No app: a fila mostra as contas da amostra de controle no fim de cada semana; a visão geral e o
monitoramento mostram a precisão confirmada e o retorno; em Configurações > Modelo, "Treinar nova
versão" com o retorno simulado gera uma versão com o selo "retorno simulado", comparada com a ativa.
Para voltar ao estado anterior: `simulate-analyst --undo`.

## Resultado no SAML-D

Rodado em 12/11/2026 numa cópia do banco de desenvolvimento (SAML-D completo), sem mexer no banco
original. As semanas de 29/05 a 10/07 foram reprocessadas para ganhar a amostra de controle (5
contas por semana). Depois, `simulate-analyst` de 22/05 a 16/07, com os padrões (10% de erro, 20%
sem evidência, semente 108), e `feedback-eval --include-simulated`.

**O analista simulado** decidiu 1.850 alertas (1.815 da fila e 35 da amostra): 1.598 comunicados,
202 falsos positivos confirmados e 50 sem evidência suficiente. 215 decisões saíram trocadas de
propósito. Ficaram 1.800 rótulos.

**O experimento** (treino até 16/07; teste de 17/07 a 23/08, contra o gabarito):

| Medida no teste | Controle (só gabarito) | Com o retorno | Diferença |
|---|---|---|---|
| PR-AUC | 0,8965 | 0,8975 | +0,001 |
| Recall com 0,13% de falso positivo | 89,7% | 90,0% | +0,3 p.p. |
| Fila com corte: recall | 93,1% | 92,8% | −0,2 p.p. |
| Fila com corte: precisão | 100,0% | 100,0% | 0 |
| Inocentes por semana na fila | 0,0 | 0,0 | 0 |

Por tipologia, só duas mudaram: `smurfing` (74,1% → 76,8%) e `gather_scatter` (94,4% → 95,8%).
Levou 7 minutos e usou 5,3 GB de memória no pico.

**Leitura honesta: o retorno não mudou o modelo de forma mensurável no SAML-D.** As diferenças
são do tamanho do ruído de uma rodada com uma semente só. Era o esperado:

- o SAML-D tem gabarito para todas as transações, e o gabarito sempre ganha; aqui o retorno só
  muda pesos, nunca acrescenta informação nova;
- só 856 rótulos pesaram no treino (cerca de 1.400 transações com peso 3), contra milhões de
  transações de treino;
- dos 1.800 rótulos, 944 caíram nas 4 semanas de validação e não pesaram.

O ganho de verdade do retorno apareceria num banco real, em que a maior parte das transações não
tem gabarito. Isso o SAML-D não consegue mostrar.

O que a rodada mostrou além disso:

- **Conflitos**: 986 das 2.382 transações cobertas discordaram do gabarito. Separando: com o
  analista certo, o falso positivo confirmado deu 0% de conflito, e a lavagem confirmada deu 45%,
  porque a conta lavadora também faz transação normal, e entre as 5 de maior nota sempre aparece
  alguma. Com só a transação de maior nota, seriam 0%. Com gabarito, isso não estraga nada (vale
  o gabarito, com peso 1). Sem gabarito, 45% das transações rotuladas como lavagem estariam
  erradas.
- **Amostra de controle**: nenhuma das 35 contas sorteadas lavou de verdade (a maior nota entre
  elas foi 0,0028). As 4 "lavagens achadas fora da fila" da demonstração são erros de propósito do
  analista simulado. Com 5 contas por semana, a amostra demora muito para achar alguma coisa: a
  lavagem é rara.

## Limites e o que fica em aberto

- As 4 semanas de validação nunca recebem peso. Se o retorno precisa pesar inteiro, a validação
  teria de vir depois da última semana com retorno, e isso pede 8 semanas com gabarito depois dela.
- `FEEDBACK_POSITIVE_TOP = 5` só é seguro enquanto o retreino exigir gabarito (ver os conflitos
  acima). Se um dia o retreino aceitar dados sem gabarito, use só a transação de maior nota ou
  deixe o analista marcar as transações.
- A comparação da trava é feita contra a versão ativa **no momento do treino**. Se outra versão
  for promovida depois, a tela mostra com qual versão a comparação foi feita, mas a trava não é
  recalculada.
- A amostra de controle só aparece nas semanas processadas depois desta mudança. Semana já
  processada ganha a amostra só se for reprocessada, e o worker recusa reprocessar semana com
  decisão ou marcada pelo replay antigo.
- O analista simulado acerta 90% por construção. Os números da demonstração dizem como o sistema
  se comporta, não como um analista de verdade decidiria.

## Onde está no código

| O quê | Onde |
|---|---|
| Esquema | `db/init/002_tables.sql` (`decisions.archive_reason`, `alerts.origin`, `analyst_labels`), `db/init/004_processing.sql` (`exploration_per_week`), `db/upgrades/006_analyst_feedback.sql` |
| Regras do rótulo e de quando dá para retreinar | `src/fraudradar/model/feedback.py` e as constantes em `src/fraudradar/model/__init__.py` |
| Do alerta às transações | `src/fraudradar/model/dataset_data.py` (`read_feedback`, `feedback_transactions`) |
| Divisão, pesos, trava e experimento | `src/fraudradar/model/training.py` |
| Amostra de controle | `worker/queue.py` (`select_exploration`) e `worker/batch.py` |
| Treino, analista simulado e experimento | `worker/train_job.py`, `worker/simulate_analyst.py`, `worker/feedback_eval.py` |
| API | `POST /alerts/{id}/decision`, `GET /feedback/summary`, `POST /datasets/{slug}/train`, `GET /datasets/{slug}/models` |
| Telas | `web/src/features/feedback`, `alerts` (decisão, fila, visão geral, monitoramento) e `models` (Configurações > Modelo) |
