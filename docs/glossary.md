# Glossário de nomes: português → inglês

Desde 30/10/2026 o **código é em inglês**: identificadores, arquivos, pastas,
tabelas e colunas, valores gravados no banco, rotas da API e do front, campos
JSON, variáveis de ambiente e comandos de CLI. Ficam em **português** os textos
que uma pessoa lê: telas do front (inclusive o `detail` de erro da API, que
aparece na tela), documentação em Markdown, comentários e docstrings, mensagens
de log e de CLI e descrições de teste.

Este arquivo é o mapa entre o vocabulário do time (português) e os nomes do
código. Nome novo segue estas tabelas; termo que não está aqui, traduza pelo
sentido e acrescente a linha.

## O que não muda

- Colunas e valores do SAML-D (`Sender_account`, `Is_laundering`, `"UK pounds"`...).
- Esquema do Supabase do VibeLog (`vibelog_nos`, `vibelog_evidencias`, `pai_id`,
  `origem_id`, bucket `vibelog-evidencias`) e os valores gravados nele
  (`prompt_humano`, `prompt_ia`, `resposta`, `marco`; áreas `ia`, `dados`,
  `geral`...). O `vibelog/AGENTS.md` proíbe mexer nesse esquema.
- Chaves do frontmatter dos registros de prompt (`id`, `area`, `autor`,
  `destino`, `pai`, `data`, `tipo`, `modelo`, `filhos`) e os nomes dos registros
  antigos em `docs/vibe-coding/prompts/`.
- Metadado do Supabase Auth: cadastro novo grava `name`; quem leu `nome` lê
  `name` e, se faltar, a chave antiga `nome`, porque usuários já cadastrados só
  têm essa.
- Mensagens de commit seguem em português (`CONTRIBUTING.md`).

## Vocabulário do domínio

| Português | Inglês | Observação |
| --- | --- | --- |
| alerta | alert | |
| fila (de alertas) | queue | `posicao_fila` → `queue_position` |
| nota de risco | score | 0 a 100 na tela (0 a 1 no banco); ordena a fila, não é probabilidade |
| conta | account | número da conta do SAML-D |
| transação | transaction | |
| movimentação (lista do detalhe) | movement | não confundir com `transaction_count` |
| remetente / recebedor | sender / receiver | |
| semana | week | sempre a segunda-feira |
| segunda-feira (da semana) | week start | |
| lote (semanal) | batch | `lotes_semana` → `weekly_batches` |
| liberar (semana no replay) | release | |
| carga (do SAML-D no banco) | load | `python -m worker load` |
| processar várias semanas de uma vez | backfill | `python -m worker backfill` |
| reprocessar (semana já processada) | force | flag `--force` do worker |
| dentro / fora do treino (semana) | in-sample / out-of-sample | flag `--allow-in-sample` do worker |
| sinais semanais | weekly signals | `evidence.weekly_signals` |
| contraparte | counterparty | `distinct_counterparties` nos sinais semanais |
| parecer (texto da IA) | assessment | |
| decisão | decision | |
| arquivar / aprofundar / comunicar | archive / escalate / report | verbo da decisão |
| motivo do arquivamento | archive reason | `decisions.archive_reason`; obrigatório ao arquivar |
| falso positivo confirmado | false_positive | motivo do arquivamento; vira rótulo 0 |
| sem evidência suficiente | insufficient_evidence | motivo do arquivamento; não vira rótulo |
| lavagem confirmada | confirmed laundering | a decisão de comunicar; vira rótulo 1 |
| retorno dos analistas | analyst feedback | rótulos das decisões, tabela `analyst_labels` (docs/analyst-feedback.md) |
| amostra de controle | exploration sample | contas sorteadas abaixo do corte; `alerts.origin = 'exploration'`, `exploration_per_week` |
| origem do alerta | alert origin | `model` (fila do modelo) ou `exploration` (amostra de controle) |
| precisão confirmada | confirmed precision | alertas da fila confirmados como lavagem ÷ alertas da fila com decisão conclusiva |
| lavagem encontrada fora da fila | found outside the queue | lavagem confirmada na amostra de controle |
| analista simulado | simulated analyst | `python -m worker simulate-analyst`; `analyst_labels.source = 'simulated'` |
| trava de promoção | promotion gate | `comparison.gate` na ficha; até 1 p.p. a menos de recall da fila que a versão ativa |
| métricas de validação | validation metrics | as do período de teste rotulado, só em Configurações > Modelo |
| arquivado / aprofundado / comunicado | archived / escalated / reported | status |
| comunicação (ao COAF) | report | tabela `reports` |
| rascunho / aprovada | draft / approved | |
| justificativa | justification | |
| evidência | evidence | incontável: tabela `evidence` |
| contribuição (SHAP) | contribution | |
| regra (de cenário) | rule | |
| tipologia | typology | |
| país | country | |
| valor (dinheiro) | amount | |
| valor (genérico, série, contribuição) | value | |
| moeda | currency | |
| meio / tipo de pagamento | payment type | |
| gabarito (`avaliacao`) | ground truth | tabela `ground_truth` |
| rótulo | label | |
| limiar | threshold | |
| métricas | metrics | |
| acerto de tipologia | typology accuracy | |
| taxa | rate | |
| sinalizado | flagged | |
| indicadores | indicators | |
| monitoramento | monitoring | |
| saúde (healthcheck) | health | |
| grafo / nó / aresta / salto | graph / node / edge / hop | |
| origem / destino (aresta do grafo) | source / target | como no Cytoscape |
| fonte (citação do parecer) | source | `titulo`/`trecho` → `title`/`excerpt` |
| fonte de dados (conexão externa) | data source | |
| conjunto de dados | dataset | schema isolado com fila, semanas e histórico próprios |
| trabalho (em segundo plano) | job | pedido persistido e executado por `worker serve` |
| período aberto / fechado | open / closed period | o aberto é a semana da transação mais recente |
| processamento automático | automatic processing | configuração em `public.processing_settings` |
| processar agora | process now | enfileira um trabalho `process` |
| simulação | simulation | ingestão sintética sem gabarito |
| contas suspeitas | suspicious accounts | visão consolidada por conta entre períodos |
| conexão | connection | |
| ingestão / envio | ingestion / upload | |
| recibo | receipt | |
| recebido / processando / concluído | received / processing / completed | |
| auditoria | audit log | tabela `audit_log` |
| analista | analyst | |
| usuário atual | current user | |
| banco (de dados) | database (`db` em nomes curtos) | |
| semente (fixture de teste) | seed | |
| pseudonimizar | pseudonymize | |
| assistente | assistant | |
| autenticação / cadastro | auth / signup | |
| recuperar / redefinir senha | reset password | |
| manter conectado | keep signed in | |
| configurações | settings | |

## Banco (`db/init/002_tables.sql`)

| Tabela antiga | Tabela nova | Colunas (antiga → nova) |
| --- | --- | --- |
| `transacoes` | `transactions` | `data_hora` → `occurred_at`, `remetente` → `sender`, `recebedor` → `receiver`, `valor` → `amount`, `moeda_pagamento` → `payment_currency`, `moeda_recebida` → `received_currency`, `pais_remetente` → `sender_country`, `pais_recebedor` → `receiver_country`, `tipo_pagamento` → `payment_type`, `ingestao_id` → `ingestion_id` |
| `ingestoes` | `ingestions` | `origem` → `source`, `nome_arquivo` → `file_name`, `linhas` → `row_count`, `quem` → `created_by`, `criado_em` → `created_at` |
| `avaliacao` | `ground_truth` | `transacao_id` → `transaction_id`, `rotulo` → `label`, `tipologia_original` → `original_typology`, `tipologia` → `typology` |
| `contas` | `accounts` | `conta` → `account`, `primeira_data` → `first_seen_at`, `ultima_data` → `last_seen_at`, `segmento` → `segment`, `atualizado_em` → `updated_at` |
| `modelo_versoes` | `model_versions` | `versao` → `version`, `criado_em` → `created_at`, `limiar` → `threshold`, `metricas` → `metrics`, `ativa` → `active` |
| `scores_transacao` | `transaction_scores` | `transacao_id` → `transaction_id`, `modelo_versao` → `model_version`, `criado_em` → `created_at` |
| `lotes_semana` | `weekly_batches` | `semana` → `week`, `modelo_versao` → `model_version`, `contas_ativas` → `active_accounts`, `metricas` → `metrics`, `processado_em` → `processed_at`, `liberada_em` → `released_at` |
| `alertas` | `alerts` | `conta` → `account`, `semana` → `week`, `posicao_fila` → `queue_position`, `paises` → `countries`, `tipologia` → `typology`, `valor_total` → `total_amount`, `qtd_transacoes` → `transaction_count`, `modelo_versao` → `model_version`, `criado_em` → `created_at`, `atualizado_em` → `updated_at` |
| `evidencias` | `evidence` | `alerta_id` → `alert_id`, `contribuicoes` → `contributions`, `regras` → `rules`, `sinais_semanais` → `weekly_signals`, `grafo` → `graph`, `criado_em` → `created_at` |
| `pareceres` | `assessments` | `alerta_id` → `alert_id`, `texto` → `content`, `tipologia_sugerida` → `suggested_typology`, `fontes` → `sources`, `validacao` → `validation`, `valido` → `is_valid`, `modelo_llm` → `llm_model`, `criado_em` → `created_at` |
| `decisoes` | `decisions` | `alerta_id` → `alert_id`, `parecer_id` → `assessment_id`, `analista` → `analyst`, `decisao` → `decision`, `justificativa` → `justification`, `decidido_em` → `decided_at` |
| `comunicacoes` | `reports` | `alerta_id` → `alert_id`, `decisao_id` → `decision_id`, `rascunho` → `draft`, `aprovado_por` → `approved_by`, `aprovado_em` → `approved_at`, `criado_em` → `created_at` |
| `documentos_rag` | `rag_documents` | `fonte` → `source`, `trecho_ordem` → `chunk_index`, `texto` → `content`, `metadados` → `metadata`, `criado_em` → `created_at` |
| `auditoria` | `audit_log` | `quem` → `actor`, `acao` → `action`, `entidade` → `entity`, `entidade_id` → `entity_id`, `detalhes` → `details`, `quando` → `occurred_at` |

Colunas que já eram inglês (`id`, `score`, `status`, `features`, `embedding`)
continuam. Índices e restrições nomeados acompanham a tabela
(`alertas_fila_idx` → `alerts_queue_idx`, `modelo_versoes_uma_ativa_idx` →
`model_versions_single_active_idx`).

Valores gravados:

| Onde | Antes | Depois |
| --- | --- | --- |
| `alerts.status` | `novo`, `em_analise`, `arquivado`, `aprofundado`, `comunicado` | `new`, `in_review`, `archived`, `escalated`, `reported` |
| `decisions.decision` | `arquivar`, `aprofundar`, `comunicar` | `archive`, `escalate`, `report` |
| `reports.status` | `rascunho`, `aprovada` | `draft`, `approved` |
| `ingestions.status` | `recebido`, `processando`, `concluido` | `received`, `processing`, `completed` |
| `ingestions.source` | `csv`, entrada manual, simulação, conexão | `csv`, `api`, `simulation`, `connection` |
| `audit_log.entity` | `alerta`, `ingestao`, `semana` | `alert`, `ingestion`, `week` |
| `audit_log.action` | `decisao`, `comunicacao_aprovada`, `ingestao`, `replay`, `lote` | `decision`, `report_approved`, `ingestion`, `replay`, `batch` |

JSON gravado pelo worker (contrato worker → API):

- `evidence.contributions`: `{"<feature>": contribuição SHAP em log-odds}`.
- `evidence.rules`: `[{"code", "description", "detail"}]`.
- `evidence.weekly_signals`: `{"sent_count", "received_count", "sent_amount",
  "received_amount", "distinct_counterparties", "cash_share", "cross_border_share"}`.
- `assessments.sources`: `[{"title", "excerpt"}]`.
- `weekly_batches.metrics`: `{"recall", "typology_accuracy", "country_rates": {país: taxa}, "payment_type_rates": {meio: taxa}}`.
  O worker grava também `precision`, `laundering_accounts` (contas lavadoras), `queue_size`
  (contas na fila) e `innocents_in_queue` (inocentes na fila), e deixa `typology_accuracy`
  de fora enquanto o modelo não prevê tipologia. O recall é avaliação de desenvolvimento: a API
  não o serve às telas.
- ficha do modelo, blocos novos: `feedback` (o retorno dos analistas usado no treino) e
  `comparison` (a versão ativa medida nas mesmas semanas de teste e a trava de promoção, `gate`).
- `model_versions.metrics`: as métricas da ficha, com `transaction_threshold` (limiar da
  transação); `model_versions.threshold` é o corte da fila (`queue_cut`).

## API

| Antes | Depois |
| --- | --- |
| `GET /saude` | `GET /health` |
| `GET /semanas` | `GET /weeks` |
| `GET /alertas?semana=&status=&pais=&pagina=&tamanho=&ordenar=` | `GET /alerts?week=&status=&country=&search=&page=&size=&sort=` (`sort`: `score_desc` ou `queue`) |
| `GET /alertas/{id}` | `GET /alerts/{id}` |
| `GET /alertas/{id}/grafo` | `GET /alerts/{id}/graph` |
| `POST /alertas/{id}/decisao` | `POST /alerts/{id}/decision` |
| `GET /alertas/{id}/comunicacao` | `GET /alerts/{id}/report` |
| `POST /alertas/{id}/comunicacao/aprovar` | `POST /alerts/{id}/report/approve` |
| `POST /alertas/{id}/parecer` | `POST /alerts/{id}/assessment` |
| `POST /alertas/{id}/chat` | `POST /alerts/{id}/chat` |
| `POST /chat` | `POST /chat` |
| `POST /replay/proxima-semana` | `POST /replay/next-week` |
| `GET /contas/suspeitas` | `GET /accounts/suspicious` |
| `GET /contas/{conta}/alertas` | `GET /accounts/{account}/alerts` |
| `GET`/`PUT /processamento/configuracoes` | `GET`/`PUT /processing/settings` |
| `POST /conjuntos/{slug}/simular` | `POST /datasets/{slug}/simulate` |
| `DELETE /ingestoes/{id}` | `DELETE /ingestions/{id}` |
| `GET /monitoramento?semana=` | `GET /monitoring?week=` |
| resumo do retorno dos analistas (não existia) | `GET /feedback/summary?from=&to=` |
| `POST /ingestao/csv` (campo multipart `arquivo`) | `POST /ingestion/csv` (campo `file`) |
| `POST /ingestao/transacoes` | `POST /ingestion/transactions` |
| `GET`/`POST /ingestao/conexoes` | `GET`/`POST /ingestion/connections` |
| `POST /ingestao/conexoes/{id}/sincronizar` | `POST /ingestion/connections/{id}/sync` |

Tags do OpenAPI acompanham o recurso (`alerts`, `decisions`, `ai`,
`ingestion`, `monitoring`, `replay`, `health`, `weeks`).

### JSON (snake_case, igual nos dois lados: Pydantic em `api/schemas/` e zod em `web/src/features/*/schemas/`)

| Modelo (Pydantic / zod) | Antes | Campos depois |
| --- | --- | --- |
| `Alert` / `alertSchema` | `Alerta` | `id`, `account`, `week`, `country`, `typology`, `score`, `amount`, `transaction_count`, `status`, `queue_position`, `origin` (`model`, `exploration`) |
| `AlertStatus` / `statusSchema` | `pendente`, `aprofundar`, `arquivado`, `comunicar` | `pending`, `escalated`, `archived`, `reported` |
| `AlertQueue` / `queueSchema` | `Fila {itens, total, paises}` | `items`, `total`, `countries` |
| `AlertDetail` / `alertDetailSchema` | `Detalhe` | campos do `Alert` + `contributions`, `rules`, `movements`, `assessment` (anulável) |
| `Contribution` | `{nome, valor}` | `name`, `value` |
| `Rule` | `{codigo, descricao}` | `code`, `description` |
| `Movement` | `Movimentacao {id, data, origem, destino, valor, moeda, meio, moeda_pagamento}` | `id`, `date`, `sender`, `receiver`, `amount`, `currency`, `payment_type`, `payment_currency` |
| `Assessment` / `assessmentSchema` | `Parecer {texto, fontes}` | `content`, `sources` |
| `Source` | `Fonte {titulo, trecho}` | `title`, `excerpt` |
| `Graph` / `graphSchema` | `Grafo {nos, arestas}` | `nodes`, `edges` |
| `Node` | `No {id, rotulo, central}` | `id`, `label`, `central` |
| `Edge` | `Aresta {id, origem, destino, valor}` | `id`, `source`, `target`, `amount` |
| `DecisionRequest` / `decisionSchema` | `PedidoDecisao {decisao, justificativa}` | `decision` (`archive`, `escalate`, `report`), `justification`, `archive_reason` (`false_positive`, `insufficient_evidence`; só ao arquivar) |
| `Report` / `reportSchema` | `Comunicacao {alerta_id, texto, status, atualizado_em}` | `alert_id`, `content`, `status` (`draft`, `approved`), `updated_at` |
| `ApprovalRequest` / `approvalSchema` | `PedidoAprovacao {texto}` | `content` |
| `Replay` / `replaySchema` | `{semana, alertas_gerados}` | `week`, `alerts_generated` |
| `Weeks` | `Semanas {atual, proxima_liberacao, itens}` | `current`, `next_release`, `items` |
| `ProcessedWeek` | `SemanaProcessada {semana, alertas, pendentes}` | `week`, `alerts`, `pending` |
| `Monitoring` / `monitoringSchema` | `Monitoramento {semana, indicadores, semanas, tipologias, paises, taxa_paises, taxa_meios}` | `week`, `indicators`, `weeks`, `typologies`, `countries`, `country_rates`, `payment_type_rates` |
| `Indicators` | `{alertas, revisados, comunicados, taxa_alerta, valor_sinalizado, recall, acerto_tipologia}` | `alerts`, `reviewed`, `reported`, `alert_rate`, `flagged_amount` (recall e acerto de tipologia saíram das telas: registro 108) |
| `FeedbackSummary` / `feedbackSummarySchema` | (não existia) | `labels`, `confirmed_precision`, `weekly_confirmed_precision`, `control_sample`, `active_version`, `new_since_active`, `retrain` |
| `Series` / `seriesSchema` | `Serie {nome, valor}` | `name`, `value` |
| `Health` / `healthSchema` | `Saude {status, banco, modelo, llm}` | `status` (`ok`, `degraded`), `database {ok, detail}`, `model {ok, file}`, `llm {ok, provider}` |
| `ChatRequest` / `chatRequestSchema` | `PedidoChat {mensagem, contexto, historico}` | `message`, `context`, `history` |
| `ChatContext` | `ContextoChat {pagina, semana, alerta_id}` | `page`, `week`, `alert_id` |
| `Message` / `messageSchema` | `Mensagem {papel, texto}` | `role` (`user`, `assistant`), `content` |
| `ChatResponse` / `chatResponseSchema` | `RespostaChat {resposta, fontes}` | `answer`, `sources` |
| `TransactionRequest` / `transactionSchema` | `PedidoTransacao` | colunas do SAML-D, sem mudança |
| `Receipt` / `receiptSchema` | `Recibo {id, status, mensagem}` | `id`, `status` (`received`, `processing`, `completed`), `message` |
| `DataSource` / `dataSourceSchema` | `FonteDados {id, nome, tipo, host_mascarado, banco_mascarado, status, ultima_sincronizacao}` | `id`, `name`, `type` (`postgres`), `masked_host`, `masked_database`, `status` (`connected`, `syncing`, `error`), `last_synced_at` |
| `DataSources` / `dataSourcesSchema` | `FontesDados {itens}` | `items` |
| `connectionSchema` (pedido) | `conexaoSchema {nome, tipo, connection_string, ssl}` | `name`, `type`, `connection_string`, `ssl` |

Valores exibidos na tela continuam em português (ex.: `"Indefinida"` quando o
alerta não tem tipologia).

## Front (`web/`)

| Antes | Depois |
| --- | --- |
| `/alertas`, `/alertas/[id]` | `/alerts`, `/alerts/[id]` (revisão de comunicação em `/alerts/[id]`) |
| `/comunicacoes` | `/reports` (removida; rascunho movido para o detalhe do alerta) |
| `/configuracoes` | `/settings` |
| `/ingestao` | `/ingestion` |
| `/monitoramento` | `/monitoring` |
| `/contas` | `/accounts` |
| `/dashboard`, `/login` | (iguais) |
| `/cadastro` | `/signup` |
| `/recuperar-senha?modo=redefinir` | `/reset-password?mode=update` |
| `/auth/callback?destino=recuperar` | `/auth/callback?next=reset` |
| `/login?erro=sessao`, `?erro=confirmacao` | `/login?error=session`, `?error=confirmation` |
| `src/features/alertas`, `assistente`, `autenticacao`, `configuracoes`, `ingestao`, `saude` | `src/features/alerts`, `assistant`, `auth`, `settings`, `ingestion`, `health` |
| cookie `fr_manter_conectado` | `fr_keep_signed_in` |
| `CONTRATOS_API.md` | `API_CONTRACTS.md` |

## Variáveis de ambiente

| Antes | Depois |
| --- | --- |
| `AUTH_DESLIGADA` | `AUTH_DISABLED` |
| `DADOS_DIR` | `DATA_DIR` |
| `INGESTAO_MAX_BYTES` | `INGESTION_MAX_BYTES` |
| `INGESTAO_MAX_LINHAS` | `INGESTION_MAX_ROWS` |
| `EXIGIR_BANCO_TESTE` | `REQUIRE_TEST_DB` |
| `MODEL_FILE` padrão `modelo_lightgbm.txt` | padrão `lightgbm_model.txt` |

O banco de teste (`TEST_DATABASE_URL`) agora precisa terminar em `_test`
(antes `_teste`); o padrão é `fraudradar_test`.

O grupo de dependências `ia` do `pyproject.toml` virou `ai`
(`uv sync --group ai`).

## Pastas e arquivos

| Antes | Depois |
| --- | --- |
| `dados/` (SAML-D.csv) | `data/` |
| `laboratorio/` | `lab/` |
| `db/init/001_extensoes.sql`, `002_tabelas.sql` | `db/init/001_extensions.sql`, `002_tables.sql` |
| `db/regras/` | `db/rules/` |
| `docs/requisitos_projeto.MD` | `docs/project-requirements.md` |
| `src/fraudradar/banco.py` | `src/fraudradar/db.py` |
| `src/fraudradar/dados/` (`ingestao.py`) | `src/fraudradar/data/` (`ingestion.py`) |
| `src/fraudradar/modelo/`, `ia/` | `src/fraudradar/model/`, `ai/` |
| `api/rotas/`, `api/repositorios/` | `api/routes/`, `api/repositories/` |
| `api/dependencias.py`, `api/dominio.py` | `api/dependencies.py`, `api/domain.py` |
| `api/repositorios/fila.py` | `api/repositories/alert_queue.py` |
| `vibelog/ENTREGA.md` | `vibelog/DELIVERY.md` |
| `vibelog/src/features/registros`, `autenticacao` | `vibelog/src/features/records`, `auth` |

Constantes citadas na documentação: `MOEDA_DOS_VALORES` → `AMOUNT_CURRENCY`,
`RENOMEAR` → `COLUMN_RENAMES`, `COLUNAS_TRANSACAO` → `TRANSACTION_COLUMNS`,
`ROTULOS` → `FEATURE_LABELS`, `COLUNAS_ALERTA` → `ALERT_COLUMNS`,
`Conexao` → `DbConnection`, `UsuarioAtual` → `CurrentUser`,
`CorpoLimitado` → `LimitedBodyRoute`, `criar_app` → `create_app`.

## CLIs

| Antes | Depois |
| --- | --- |
| `python -m worker lote --semana AAAA-MM-DD` | `python -m worker batch --week AAAA-MM-DD` |
| `python -m worker replay` | (igual) |
| carga do SAML-D (não existia) | `python -m worker load [--csv CAMINHO]` |
| várias semanas de uma vez (não existia) | `python -m worker backfill [--from AAAA-MM-DD] [--to AAAA-MM-DD]` |
| reprocessar / aceitar semana do treino (não existiam) | `--force` / `--allow-in-sample` (em `batch` e `backfill`) |
| decidir pelo gabarito, para a demonstração (não existia) | `python -m worker simulate-analyst [--from] [--to] [--error-rate] [--insufficient-rate] [--seed] [--undo]` |
| medir o efeito do retorno (não existia) | `python -m worker feedback-eval [--include-simulated]` |
| `pnpm vibelog no` | `pnpm vibelog node` |
| `pnpm vibelog evidencia` | `pnpm vibelog evidence` |
| `pnpm vibelog importar-md`, `importar-claude`, `importar-codex` | `pnpm vibelog import-md`, `import-claude`, `import-codex` |
| `--tipo`, `--autor`, `--titulo`, `--pai`, `--destino`, `--modelo`, `--origem-id`, `--arquivo`, `--no`, `--legenda`, `--tema escuro\|claro` | `--type`, `--author`, `--title`, `--parent`, `--target`, `--model`, `--source-id`, `--file`, `--node`, `--caption`, `--theme dark\|light` |

Os valores aceitos por `--type` e `--area` são os gravados no Supabase e não
mudam (`prompt_humano`, `resposta`, `ia`, `dados`...).

## Modelo (`src/fraudradar/features` e `src/fraudradar/model`)

O modelo LightGBM veio de `lab/modelo-lightgbm/`, onde os nomes eram em português
(ver `docs/model.md`).

| Português | Inglês | Observação |
| --- | --- | --- |
| CAIXA | cash account | `CASH_ACCOUNT = -1`: o outro lado de todo saque e depósito em espécie |
| contraparte nova | new counterparty | primeira transação entre as duas contas |
| atalho (do gerador) | shortcut | regra simples que, no treino, só pega lavagem |
| base (do modelo) | training data | `TrainingData` |
| gabarito (da avaliação) | truth | tabela que só a avaliação lê |
| treino / validação / teste | train / validation / test | divisão no tempo, nunca embaralhada |
| conta-semana | account week | uma linha por conta e semana, com o maior score |
| corte da fila | queue cut | `queue_cut` na ficha |
| limiar da transação | transaction threshold | `transaction_threshold` na ficha |
| ficha (do modelo) | model card | `models/lightgbm_vN.json` |
| segmento (K-Means) | segment | coluna `accounts.segment` |
| perfil da conta | account profile | entrada dos segmentos |
| lavadora / inocente (conta) | launderer / innocent | |
| conferência (do modelo) | check | `python -m fraudradar.model check` |

Variáveis (`features/history.py`). Os valores de `payment_type` são os do SAML-D
(`Cash Deposit`...), não os nomes que o lab usava (`deposito_especie`...). O nome
que a tela mostra para cada variável está em `FEATURE_LABELS`.

| No lab | No código |
| --- | --- |
| `valor`, `hora`, `meio_pagamento` | `amount`, `hour`, `payment_type` |
| `pais_remetente`, `pais_recebedor` | `sender_country`, `receiver_country` |
| `transfronteirica`, `moeda_diferente` | `cross_border`, `currency_mismatch` |
| `rem_n_antes`, `rem_valor_medio_antes`, `rem_razao_valor` | `sender_sent_count`, `sender_mean_amount`, `sender_amount_ratio` |
| `rem_dias_desde_ultima`, `rem_n_7d`, `rem_soma_7d` | `sender_days_since_last`, `sender_sent_count_7d`, `sender_sent_amount_7d` |
| `rem_n_destinos_antes`, `novo_recebedor`, `rem_frac_novos_7d` | `sender_distinct_receivers`, `new_counterparty`, `sender_new_counterparty_share_7d` |
| `rem_recebido_7d`, `rem_n_recebidas_7d`, `rem_razao_saida_entrada_7d` | `sender_received_amount_7d`, `sender_received_count_7d`, `sender_out_in_ratio_7d` |
| `rec_n_antes`, `rec_n_origens_antes`, `rec_novas_origens_7d` | `receiver_received_count`, `receiver_distinct_senders`, `receiver_new_senders_7d` |
| `rec_dias_desde_ultima`, `rec_n_7d`, `rec_soma_7d`, `rec_enviado_7d` | `receiver_days_since_last`, `receiver_received_count_7d`, `receiver_received_amount_7d`, `receiver_sent_amount_7d` |

Métricas da ficha (vão para `model_versions.metrics`):

| No lab | No código |
| --- | --- |
| `pr_auc_validacao`, `pr_auc` | `pr_auc_validation`, `pr_auc` |
| `recall_013fp`, `recall_013fp_sem_atalho`, `recall_013fp_contas_novas` | `recall_at_fpr`, `recall_at_fpr_no_shortcut`, `recall_at_fpr_new_accounts` |
| `f1`, `f1_precisao`, `f1_recall` | `f1`, `f1_precision`, `f1_recall` |
| `fila_recall`, `fila_precisao`, `fila_recall_sem_atalho` | `queue_recall`, `queue_precision`, `queue_recall_no_shortcut` |
| `falso_positivo_no_limiar`, `recall_no_limiar` | `test_fpr_at_threshold`, `test_recall_at_threshold` |
| `fila_com_corte` (`contas_por_semana`, `inocentes_por_semana`) | `queue_with_cut` (`accounts_per_week`, `innocents_per_week`) |
