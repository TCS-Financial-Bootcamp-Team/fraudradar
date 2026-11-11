# Processamento contínuo, conjuntos de dados, bancos externos e retreino

Desenho do FraudRadar como sistema que recebe dados e devolve as contas suspeitas, sem o analista
"liberar semanas". Decisões do Pedro em 11/11/2026 (registros 095 e 098); as decisões técnicas são
do Claude (reversíveis).

## Decisões do Pedro

1. A tela principal é **Contas suspeitas**: lista consolidada por conta, juntando todos os períodos;
   a semana vira filtro, não porta de entrada.
2. O processamento contínuo roda num **intervalo configurável, de hora em hora por padrão**.
3. O antigo "Liberar próxima semana" vira **Simular novas transações**: gera transferências falsas
   para demonstrar a reverificação do worker.
4. O worker é acionado **pelo front**: sozinho, no intervalo, e por um botão **Processar agora**.
5. Dados de banco externo sempre recebem nota do modelo em uso; **retreino só com gabarito**, numa
   versão nova que só vira oficial depois de comparada e promovida pelo analista.
6. Uma base que não continua os dados atuais vira **conjunto separado** (fila, períodos e histórico
   próprios). Ao conectar, a tela pergunta a relação e o modo de processamento.

## Unidade de análise e períodos

- O alerta continua sendo **conta × semana**: é o padrão de PLD (lote, não tempo real) e é como o
  modelo foi treinado e calibrado (corte, tamanho da fila e recall são semanais).
- **Período aberto** = a semana mais recente com transações. A cada rodada o worker recalcula só ele,
  com as transações que chegaram. **Períodos fechados ficam congelados**: notas e alertas não mudam,
  porque podem ter decisões e entram na auditoria.
- Ao recalcular o período aberto: alertas que já têm decisão ficam como estão (status, decisão,
  comunicação); os alertas sem decisão são substituídos pela fila nova da semana; uma conta com
  decisão não ganha um segundo alerta na mesma semana.
- Uma semana fecha quando chega transação de uma semana posterior; o worker então processa a semana
  nova como aberta.
- Não existe mais "semana liberada": toda semana processada aparece. `weekly_batches.released_at` e
  `POST /replay/next-week` saem do fluxo (a coluna pode ficar, sem uso).

## Contas suspeitas (tela principal)

- `GET /accounts/suspicious?from=&to=&status=&search=&page=&size=&sort=`: uma linha por conta com
  alerta no intervalo (padrão: todos os períodos), com maior nota, nota do período mais recente,
  quantas semanas em alerta, primeira e última semana, valor total sinalizado, país principal, status
  do alerta mais recente e o id dele. Ordena por maior nota (desempate pela posição na fila do
  período mais recente).
- A tela mostra a lista com busca, filtros por status e período, e abre o alerta mais recente da
  conta; o detalhe do alerta ganha "Outras semanas desta conta". A fila semanal continua existindo
  como visão por período.

## Processamento automático

- `public.processing_settings` por conjunto: `interval_minutes` (padrão 60; mínimo 5, máximo 1440),
  `enabled`, `last_run_at`, `next_run_at`. Editável em Configurações (conjunto atual).
- O `worker serve`, além de executar a fila `jobs`, agenda sozinho um trabalho `process` para cada
  conjunto quando `next_run_at` passa e não há outro `process` desse conjunto na fila ou rodando.
- `process` = processar as semanas novas ou incompletas do conjunto: o período aberto (recalculado)
  e qualquer semana posterior ainda sem lote. Sem transação nova desde a última rodada: termina rápido
  com "nada novo".
- Front: botão **Processar agora** (`POST /datasets/{slug}/process`), indicador discreto do último
  processamento e do próximo, e o status do trabalho em andamento (progresso e mensagem pelo
  `GET /jobs/{id}`); ao terminar, recarrega os dados e notifica.
- Trabalho preso em `running` por mais de 2 h (worker caiu) volta para `failed` com a mensagem
  "interrompido" na próxima volta do `worker serve`.

## Simulador de transações (demonstração)

- `POST /datasets/{slug}/simulate` com `{ transactions: 50–5000, days: 1–7, inject_pattern: bool }`
  enfileira `simulate` e, ao terminar, um `process`.
- O worker gera transações **depois da última data** do conjunto, reamostrando transações reais
  (valores, meios, moedas e países pela distribuição do próprio conjunto) entre contas existentes.
  Com `inject_pattern`, acrescenta um padrão de fan-out conhecido (uma conta recebe e espalha para
  muitas contas novas em poucos dias), para a demonstração ter alerta.
- Tudo entra como uma ingestão com `source = 'simulation'` (em `ingestions`), para identificar e
  apagar (`DELETE /ingestions/{id}`, que só aceita simulações e reabre o período afetado). Nunca grava
  gabarito.
- O botão fica em Fontes de dados, e na visão geral só quando o "modo demonstração" está ligado em
  Configurações (desligado por padrão).

## Conjuntos de dados

- Cada conjunto é um **schema do Postgres** com as mesmas tabelas de `db/init/002_tables.sql`; o
  SAML-D fica em `public` (`saml-d`), os outros em `ds_<slug>`. A API escolhe pelo `X-Dataset`, o
  worker por `--dataset`; o registro é `public.datasets`. (Fase A, já feita.)
- Modelos por conjunto: `models/<slug>/lightgbm_vN.txt` + ficha; `datasets.active_model_version` diz
  qual dá as notas; o conjunto novo começa com a versão oficial do SAML-D.

## Conexões externas

- `public.external_connections`: nome, host, porta, banco, usuário, **senha cifrada** (Fernet, chave
  `CONNECTIONS_SECRET_KEY` só na API e no worker), tabela de origem, coluna de controle (data/hora ou
  id crescente) para ler só o que é novo, última posição lida, status, relatório de compatibilidade,
  conjunto de destino, modo. A senha nunca volta em resposta nem em log.
- Leitura em transação `READ ONLY`, com `statement_timeout` e `connect_timeout` curtos, só as colunas
  do SAML-D pela lista fixa (sem SQL do usuário); tabela validada como identificador e citada.
- SSRF: `EXTERNAL_DB_ALLOWED_HOSTS` (lista) limita os hosts; vazio = recusa. Para a demo local,
  `localhost,127.0.0.1,host.docker.internal`.

### Teste e relatório de compatibilidade

Colunas obrigatórias e tipos; se há gabarito (`Is_laundering`, opcional `Laundering_type`); total de
linhas e intervalo de datas; amostra de até 1.000 linhas validada pelo validador da ingestão de CSV
(`src/fraudradar/data/ingestion.py`); sobreposição com o conjunto atual (% de contas da amostra que
já existem; se as datas continuam, cruzam ou são de outra época). A sobreposição só **sugere**.

### As duas perguntas ao conectar

1. **Relação**: os dados continuam o conjunto atual (mesmas contas, períodos seguintes) ou são outro
   dataset com a mesma estrutura (cria um conjunto novo)? Continuar com datas que cruzam períodos
   fechados é recusado.
2. **Processamento**: analisar o histórico agora, acompanhar só o que entrar daqui para frente, ou os
   dois. "Acompanhar" faz o `process` de cada rodada ler primeiro as linhas novas da fonte (pela
   coluna de controle).

A importação é um trabalho `import` (lotes, progresso) seguido de `process`.

## Retreino

- Só é oferecido quando o conjunto tem gabarito. O worker treina com a configuração oficial
  (`src/fraudradar/model`), com corte no tempo, e grava a versão nova do conjunto com as métricas.
- A versão nova **não** vira oficial sozinha: a tela mostra as métricas lado a lado com a versão
  ativa e o analista promove (`POST /datasets/{slug}/models/{version}/promote`), com auditoria; a
  partir daí as próximas rodadas usam a versão nova (períodos fechados não mudam).
- O gabarito só é usado para treinar e medir. O modelo nunca o lê para dar nota.
