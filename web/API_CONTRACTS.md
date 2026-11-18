# Contratos do frontend

Os schemas Zod em `src/features/*/schemas/` são a referência executável.
Todas as respostas são JSON, exceto o pedido multipart de CSV. Erros HTTP
não são convertidos em sucesso nem em mocks. As rotas de domínio exigem
`Authorization: Bearer <access_token do Supabase>`. A API deve validar o JWT
e autorizar os dados; o proxy do frontend não substitui a autorização da API.
Todas as requisições do frontend enviam `X-Dataset` com o slug do conjunto atual;
na ausência do cabeçalho a API usa `saml-d`. Rotas de dados respondem 404, com
mensagem em português, quando o slug não existe.

Datas de semana: `AAAA-MM-DD`; timestamps: ISO 8601. Score e contribuições:
0–100. Taxas: frações de 0–1. Valores monetários nos indicadores: BRL.
A normalização/conversão dos valores é responsabilidade da API.

## Alertas e monitoramento

| Requisição                          | Pedido / resposta assumida                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET /alerts                         | Query: week obrigatória; status, country, search e origin (model \| exploration) opcionais; page (base 1), size=10, sort=score_desc. Resposta: queueSchema; a amostra de controle vem sempre no fim. |
| GET /alerts/{id}                    | alertDetailSchema: resumo, contributions, rules, movements e assessment anulável.                            |
| GET /alerts/{id}/graph              | graphSchema: nodes e edges, com IDs/labels de contas pseudonimizados. Até dois saltos.                       |
| POST /alerts/{id}/assessment        | Pedido {}; resposta assessmentSchema com content, summary e sources {title, excerpt}.                        |
| POST /alerts/{id}/decision          | decisionSchema: decision, justification e archive_reason (obrigatório só ao arquivar: false_positive \| insufficient_evidence; nas outras decisões, 422). Resposta alertSchema atualizado. |
| GET /alerts/{id}/report             | reportSchema: alert_id, content, status, updated_at.                                                         |
| POST /alerts/{id}/report/approve    | approvalSchema: {content}; resposta reportSchema atualizado. A edição é persistida junto da aprovação.       |
| POST /alerts/{id}/chat              | chatRequestSchema; resposta chatResponseSchema.                                                              |
| GET /weeks                          | weeksSchema: {current, next_release, items}. Todos os períodos processados entram; next_release é sempre nulo. |
| POST /replay/next-week              | Compatibilidade: replaySchema; não controla mais a visibilidade nem é chamado pela UI.                       |
| GET /monitoring?week=               | monitoringSchema, usado pelo dashboard e pela tela de monitoramento. Sem recall: ver abaixo.                 |
| GET /feedback/summary?from=&to=     | feedbackSummarySchema: o retorno dos analistas (ver "Retorno dos analistas").                                |
| GET /health                         | healthSchema, compatível com o contrato anterior.                                                            |

Status de alerta: pending, escalated, archived, reported. Origem do alerta: `model` (passou do
corte da fila) ou `exploration` (amostra de controle, sorteada abaixo do corte; a fila mostra o
selo "Amostra de controle" e ela fica fora das contagens de alertas e das contas suspeitas).
Decisão: archive, escalate, report. Justificativa: 10–4000 caracteres. Motivo do arquivamento:
"Falso positivo confirmado" (`false_positive`, vira rótulo para o retreino) ou "Sem evidência
suficiente" (`insufficient_evidence`, não vira rótulo).
Comunicação: draft ou approved; content: 30–20000 caracteres para aprovação.

A fila retorna `{items, total, countries}`. `total` é o total filtrado antes da
paginação (reflete os filtros de status, país e busca); `countries` é o catálogo
disponível para o filtro na semana e não deve sumir quando um país for selecionado.
A API deve ordenar por score antes de paginar.

O detalhe contém contas pseudonimizadas, dados financeiros, regras e
contribuições já calculadas. O frontend não calcula features ou score.

O parecer (`Assessment`, tanto na geração quanto no detalhe) retorna
`{content, summary, sources}`. `content` é o relatório completo em Markdown; `summary`
é a prévia curta para o card, calculada pela API a partir da seção `Resumo`, sem coluna
adicional no banco. Pareceres antigos usam o primeiro parágrafo sem título, limitado
perto de 300 caracteres, preferindo uma frase completa e acrescentando `…` quando cortado.
O relatório completo pode ser aberto no modal e usado no download.

Novos pareceres solicitam, nesta ordem, as seções `## Resumo` (2–3 frases, até
60 palavras), `## Sinais de risco`, `## Contexto transacional`, `## Fundamentação jurídica`,
`## Limitações` e `## Próximos passos sugeridos`. A linha de tipologia gerada pelo provedor
é processada pela API e removida de `content`. A geração usa até 1.500 tokens de saída;
o prompt contextual mantém o limite de 2.000 caracteres e a proteção de identificadores.
As instruções de estrutura seguem na configuração do sistema, fora desse prompt contextual.
As fontes retornadas contêm somente os IDs citados em `content`, sem renumeração,
ordenados pelo número do ID. Pareceres antigos também aceitam citações no formato `[1]`.

## Contas suspeitas e processamento

| Requisição | Pedido / resposta |
| --- | --- |
| `GET /accounts/suspicious` | Query `from`, `to`, `status`, `search`, `page`, `size`, `sort`; resposta `suspiciousAccountsSchema`. |
| `GET /accounts/{account}/alerts` | resposta `{items: alertSchema[]}`, do período mais recente ao mais antigo. |
| `GET /processing/settings` | `processingSettingsSchema` do conjunto indicado por `X-Dataset`. |
| `PUT /processing/settings` | `{interval_minutes: 5..1440, enabled, demo_mode, exploration_per_week: 0..50}`; resposta atualizada. `exploration_per_week` é a amostra de controle (0 desliga). |
| `POST /datasets/{slug}/simulate` | `{transactions: 50..5000, days: 1..7, inject_pattern}`; `jobSchema` com 202. |
| `DELETE /ingestions/{id}` | somente `source=simulation`; `jobSchema` de recomputação com 202. |

`suspiciousAccountSchema`: `{account, max_score, latest_score, alert_weeks,
first_week, last_week, total_flagged_amount, country, status, latest_alert_id}`.
Ordenação padrão: maior nota; empate pela posição do alerta do período mais recente.

`processingSettingsSchema` acrescenta `{dataset, last_run_at, next_run_at}` ao pedido.
O front consulta `GET /jobs/{id}` a cada 2 s enquanto o status for `queued` ou `running`,
para em `done`/`failed`, notifica e recarrega o contexto do app.

Monitoramento retorna:

- week;
- indicators: alerts, reviewed, reported, alert_rate, flagged_amount (só a fila do modelo);
- weeks, typologies, countries, country_rates, payment_type_rates e score_histogram: listas {name, value};
- status_counts: contagem por status do alerta ({pending, escalated, archived, reported}).

A série semanal inclui o histórico até a semana de referência. **Não há recall nem acerto de
tipologia nas telas de operação**: uma plataforma de verdade não tem gabarito para medi-los. O
worker continua gravando essas métricas no lote (avaliação de desenvolvimento), e a validação
contra o gabarito de cada versão do modelo aparece só em Configurações > Modelo.

### Retorno dos analistas

`GET /feedback/summary?from=&to=` (conjunto pelo `X-Dataset`; datas quaisquer, vale a segunda):

- `labels`: `{total, laundering, false_positive, analyst, simulated, model, exploration}`;
- `confirmed_precision`: alertas da fila confirmados como lavagem ÷ alertas da fila com decisão
  conclusiva; `weekly_confirmed_precision`: a mesma taxa por semana (`{week, name, ...}`);
- `control_sample`: `{sampled, reviewed, found_outside_queue}` (lavagem achada entre as contas
  sorteadas fora da fila);
- `active_version` e `new_since_active` (rótulos criados depois do treino da versão ativa);
- `retrain`: `{can_retrain, reason, can_retrain_with_simulated, reason_with_simulated}`.

Toda taxa é `{value (null sem casos), numerator, denominator, low_sample}`; `low_sample` é
verdadeiro com menos de 20 casos, e a tela avisa "amostra pequena".

O rascunho da comunicação é revisado e aprovado diretamente no detalhe do alerta
(`/alerts/{id}`), consultando `GET /alerts/{id}/report` e gravando a aprovação via
`POST /alerts/{id}/report/approve`.

**Nada é enviado ao COAF.** O indicador de comunicados representa aprovações
simuladas neste produto acadêmico. Validar esse rótulo com o responsável do produto.

## Ingestão: contratos novos

| Requisição                             | Pedido / resposta                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST /ingestion/csv                    | multipart/form-data com campo file (File); resposta receiptSchema.                                 |
| POST /ingestion/transactions           | transactionSchema com as 10 colunas transacionais; resposta receiptSchema.                         |
| GET /ingestion/connections             | connectionsSchema: {items: Connection[]}; nunca traz senha (só host e banco mascarados).           |
| POST /ingestion/connections            | connectionFormSchema: {name, host, port, database, user, password, table, control_column}; 201 com connectionSchema. 422 host fora de EXTERNAL_DB_ALLOWED_HOSTS ou identificador inválido; 503 sem CONNECTIONS_SECRET_KEY. |
| DELETE /ingestion/connections/{id}     | 204; 409 durante a importação. A tela ainda não chama (lib/api.ts não tem apiDelete).              |
| POST /ingestion/connections/{id}/test  | Pedido {}; resposta compatibilityReportSchema (itens passou/falhou, gabarito, linhas, datas, amostra, sobreposição com o conjunto de `X-Dataset` e sugestão). |
| POST /ingestion/connections/{id}/import | importRequestSchema: {relation: extend \| new_dataset, new_dataset?: {name, slug}, mode: history \| follow \| both, control_column}; 202 com {dataset, job}. 422 datas que cruzam semanas fechadas; 409 conexão já ligada ou importando. Acompanhar por GET /jobs/{id}. |
| POST /chat                             | chatRequestSchema; resposta chatResponseSchema.                                                    |

`receiptSchema`: {id, status: received | processing | completed, message}.
Recebimento do arquivo não significa conclusão do processamento.

`dataSourceSchema`: {id, name, type: postgres, masked_host, masked_database,
status: connected | syncing | error, last_synced_at: string | null}.
**Nunca retornar URI, usuário ou senha.** A API guarda as credenciais, define os
destinos permitidos para conexão e executa a leitura/sincronização no servidor.
O frontend não se conecta a bancos. O envio exige HTTPS, com exceção de localhost
para desenvolvimento. O sinalizador ssl refere-se à conexão API → Postgres.

O formulário aceita URI ou monta a URI a partir de host/porta/banco/usuário/senha,
codificando os componentes. Os campos secretos são limpos após a tentativa de
cadastro, não entram em localStorage e não são usados no chat.

O CSV deve conter exatamente as 10 chaves de transactionSchema, sem colunas de
avaliação (o SAML-D tem 12 colunas; Is_laundering e Laundering_type ficam fora). A prévia usa PapaParse em blocos de 64 KiB, com preview=20 e limite
defensivo de 1 MiB. O arquivo original segue por multipart, sem ser convertido
integralmente para JSON. A validação local cobre somente a amostra: a API precisa
validar todas as linhas, rejeitar colunas extras e definir limites de upload.

Datas: AAAA-MM-DD; horário: HH:MM ou HH:MM:SS; valor numérico positivo.
Os catálogos de moedas, países e meios são sugestões pesquisáveis. Nomes de
moedas do arquivo SAML-D são preservados; validar normalização e catálogo oficial
com o time da API. Não há inferência de taxa de câmbio no cliente.

### O que a API faz na ingestão

Implementado em POST /ingestion/csv e /ingestion/transactions; as regras ficam em
`src/fraudradar/data/ingestion.py`.

- **Contas**: o zod aceita texto de até 64 caracteres, mas as colunas são
  `BIGINT`. A API aceita só dígitos (0–9), sem zero à esquerda, de 1 até
  9223372036854775807, e recusa o resto com 422. Na coluna numérica o zero à
  esquerda se perderia e "0123" viraria a mesma conta que "123".
- **CSV**: UTF-8 (BOM opcional), separado por vírgula, cabeçalho na linha 1 com as
  10 colunas em qualquer ordem, como em `validateCsvHeaders`. Coluna faltando,
  repetida, desconhecida ou de avaliação (Is_laundering, Laundering_type) → 422.
  Linhas em branco são puladas.
- **Valores**: Amount é arredondado para centavos, como a coluna NUMERIC(14,2), e
  precisa ficar entre 0.01 e 999999999999.99. Moedas e países são gravados como
  vieram, sem espaços nas pontas e sem caracteres de controle.
- **Tudo ou nada**: com qualquer linha inválida nada é gravado. O 422 tem o
  formato do FastAPI, `{"detail": [{"type", "loc", "msg"}]}`, com até 20 erros. No
  CSV, `loc` é `["body", "file", row, column]` e `msg` começa por "Linha N,
  coluna X:"; na transação avulsa, `loc` é `["body", field]`.
- **Limite por envio**: 20 MiB e 200 mil linhas; acima disso, 413 com `detail` em
  texto. A API recusa no meio do envio, e o navegador pode mostrar isso como
  falha de conexão: confira `file.size` antes de enviar.
- **Resposta**: 201 com receiptSchema, status `received`; o id é o do envio
  (tabela `ingestions`). O score sai quando o worker processa a semana.

## Conjuntos de dados e trabalhos

| Requisição | Pedido / resposta |
| --- | --- |
| `GET /datasets` | lista `datasetSchema[]`, ordenada por criação |
| `POST /datasets` | pedido `{name, slug}`; cria um conjunto vazio e responde `datasetSchema` com 201 |
| `POST /datasets/{slug}/process` | sem corpo; enfileira o processamento e responde `jobSchema` com 202 |
| `GET /jobs?dataset=` | até 20 trabalhos mais recentes; filtro por slug opcional |
| `GET /jobs/{id}` | um `jobSchema`; 404 quando não existe |
| `GET /datasets/{slug}/models` | `modelsSchema`: `{dataset, active_version, versions[], can_train, train_blocked_reason, training_job, training_feedback}`. Cada versão: `{version, source: "official" \| "dataset", created_at, trees, history_start, train_end, metrics{pr_auc, recall_at_fpr, f1, queue_recall, queue_precision, innocents_per_week}, active, comparison, feedback}`. `metrics` são de validação, no período de teste rotulado. `comparison` (anulável, fichas antigas não têm): `{active_version, period{start, end, weeks}, candidate{pr_auc, queue_recall, queue_precision, innocents_per_week}, active{...}, recall_difference, tolerance, gate{passed, reason}}`, a versão nova e a ativa nas mesmas semanas de teste. `feedback` (anulável): o retorno usado no treino. `training_feedback`: `{analyst{laundering, false_positive}, simulated{...}, blocked_reason, blocked_reason_with_simulated}`, o retorno de períodos fechados disponível para o próximo treino. `can_train`/`train_blocked_reason` vêm do resumo do gabarito que o worker grava em `public.datasets` (a API não lê `ground_truth`). 404 conjunto inexistente |
| `POST /datasets/{slug}/train` | corpo opcional `{use_feedback: false, include_simulated: false}`; enfileira o treino e responde `jobSchema` (`kind: "train"`) com 202. 409 com o motivo em português: sem gabarito, menos de 6 semanas rotuladas, sem lavagem, treino já na fila ou, com `use_feedback`, menos de 50 rótulos de períodos fechados ou nenhum de uma das classes. 422 `include_simulated` sem `use_feedback` |
| `POST /datasets/{slug}/models/{version}/promote` | sem corpo; torna a versão a ativa do conjunto e responde `modelsSchema` com 200. `{version}` é `lightgbm_vN` (oficial: volta a seguir o oficial mais novo) ou `<slug>/vN` (retreino do conjunto; a barra vai codificada, `%2F`). 404 versão inexistente ou de outro conjunto; 409 já é a ativa ou a trava de promoção bloqueou a versão (o `detail` traz o motivo) |

**Nome das versões**: o modelo oficial é `lightgbm_vN`; o retreino de um conjunto é `<slug>/vN`
(`models/<slug>/lightgbm_vN.*` no disco). É assim em `active_model_version`, em
`model_versions` e nas respostas, para os dois nunca colidirem.

`datasetSchema`: `{slug, name, origin: "saml-d" | "external",
active_model_version: string | null, created_at}`. O slug aceita somente
`[a-z0-9-]{1,40}`. A tela guarda o slug atual no `localStorage`, com fallback
seguro para `saml-d`; a troca limpa a semana selecionada e recarrega os recursos.

`jobSchema`: `{id, kind: "import" | "process" | "simulate" | "train", dataset, status:
"queued" | "running" | "done" | "failed", progress, message, created_at,
started_at, finished_at}`. `process`, `simulate`, `import` e `train` executam trabalho real. O front tem um só
tipo de trabalho e um só acompanhamento (`web/src/features/jobs`).

## Chat e privacidade

Modelos e histórico no servidor:

| Requisição | Pedido / resposta |
| --- | --- |
| `GET /ai/models` | Autenticado; responde `aiModelsResponseSchema`: `{default, models: [{id, label}]}` a partir de `LLM_MODEL` (sempre primeiro) e `LLM_MODEL_OPTIONS`. Sem `LLM_MODEL`, responde 503 `ai.not_configured`. |
| `POST /chat` | `chatRequestSchema`; resposta `chatResponseSchema` com `conversation_id` preenchido. Rejeita `context.alert_id` com 400 `ai.chat_alert_route`. |
| `POST /alerts/{id}/chat` | `chatRequestSchema`; resposta `chatResponseSchema` com `conversation_id` preenchido. Suporta as mesmas rotas e persistência; quando `route === "system"`, passa `page="alert"`, `path` do pedido e `alert_id` ao agente. |
| `GET /chat/conversations?limit=30` | Query `limit` (`1..100`); exige autenticação e `X-Dataset`. Resposta `conversationListSchema`: `[{id, title, updated_at, message_count}]`, da mais recente à mais antiga. |
| `GET /chat/conversations/{id}` | Exige autenticação e `X-Dataset`. Resposta `conversationDetailSchema`: `{id, title, updated_at, messages: [{role, content, kind?, sources, links, model?, grounded?, created_at}]}`. 404 `chat.conversation_not_found` quando inexistente, de outro usuário ou de outro conjunto. |
| `DELETE /chat/conversations/{id}` | Exige autenticação e `X-Dataset`. Responde 204 sem corpo; 404 `chat.conversation_not_found` quando inexistente, de outro usuário ou de outro conjunto. |

Campos de pedido e resposta (`ChatRequest`, `ChatContext`, `ChatResponse`):

- `ChatRequest`: `{message, context, history, model?, conversation_id?}`.
  - `model` (`string | null`): identificador opcional entre os retornados por `GET /ai/models`. Valor desconhecido ou fora da lista permitida responde 422 `ai.model_not_allowed` (com `params: {model}`). Quando o modelo escolhido responde HTTP 503 ou 429, a API tenta **uma vez** o próximo modelo da lista (no roteador e na geração) e devolve em `ChatResponse.model` o modelo que efetivamente respondeu.
  - `conversation_id` (`number | null`, inteiro positivo): quando ausente em `POST /chat` ou `POST /alerts/{id}/chat`, cria uma nova conversa em `public.chat_conversations` (título = primeira pergunta com espaços colapsados até 80 caracteres). Quando informado, o servidor valida dono (`User.id`) e conjunto (`X-Dataset`) — respondendo 404 `chat.conversation_not_found` caso contrário —, usa as últimas 6 mensagens gravadas no banco e **ignora** `request.history`. A mesma conversa pode misturar turnos globais (`/chat`) e de alerta (`/alerts/{id}/chat`).
- `ChatResponse`: `{kind, answer, sources, links, model, conversation_id, grounded}`.
  - `kind`: `small_talk | legal | domain | decision | system | out_of_scope`.
  - `grounded` (`boolean | null`): `true` quando `kind="legal"` traz fontes jurídicas validadas (ou fallback `llm_unavailable`); `false` quando a base não cobre uma pergunta pertinente e o assistente responde por conhecimento geral sem citações nem `sources`; `null` nas demais rotas.
  - `links`: até 5 itens `{href, label}` (`label` 1–60 caracteres), produzidos exclusivamente pela ferramenta `suggest_link` da rota `system`.
  - `model` (`string | null`): identificador do modelo que produziu a resposta (ou `null` em respostas fixas sem LLM).
  - `conversation_id` (`number | null`): ID da conversa persistida (sempre preenchido em respostas bem-sucedidas de `POST /chat` e `POST /alerts/{id}/chat`).
- Turnos que falham não são persistidos; turnos concluídos gravam pergunta e resposta em uma única transação curta e atualizam `updated_at`.

Contexto da página (`ChatContext`):

- `{page, week, alert_id?, path?, page_state?}`.
- `ChatContext.path`: caminho do navegador começando por `/`, até 200 caracteres.
- `ChatContext.page_state`: `{filters, visible_alert_ids, page?, total?}` (até 20 chaves de até 40 caracteres, valores textuais de até 100 caracteres, até 100 IDs inteiros positivos em `visible_alert_ids`).
- A API **nunca confia** em números vindos do cliente: recarrega os alertas visíveis do banco por ID no conjunto atual, descarta IDs inexistentes ou de outro conjunto e envia ao LLM apenas campos pseudonimizados (sem números de conta). Em `/accounts`, o front envia só os filtros, nunca contas. Filtros passam pelo guarda de identificadores.

Roteamento e links:

- Histórico enviado sem `conversation_id`: até 20 entradas `{role: user | assistant, content}`.
- `ChatResponse.kind` é obrigatório: `small_talk | legal | domain | decision | system | out_of_scope`.
  `decision` só é retornado por `/alerts/{id}/chat`; no chat global vira `domain`. A rota `system` funciona tanto em `/chat` quanto em `/alerts/{id}/chat` (sem rebaixar para `domain`), executando o mesmo agente com ferramentas somente leitura no conjunto atual (`search_alerts`, `get_alert`, `list_weeks`, `get_week_summary`, `get_page_items`, `suggest_link`); em `/alerts/{id}/chat`, o contexto da página leva `page="alert"`, `path` do pedido e `alert_id`.
- `links`: até 5 itens `{href, label}` (`label` 1–60 caracteres), produzidos exclusivamente
  pela ferramenta `suggest_link` da rota `system`. Destinos permitidos (validados no servidor
  e no front): `/dashboard`, `/alerts`, `/alerts/{inteiro positivo}`, `/accounts`,
  `/monitoring`, `/ingestion`, `/settings`. Qualquer outro destino ou URL externa é descartado;
  o texto de `answer` continua sendo Markdown puro, sem HTML bruto.
- O pedido mantém o mesmo formato: pergunta com até 2.000 caracteres e até 20 mensagens
  de histórico, com até 8.000 caracteres por mensagem. O servidor usa somente as últimas
  seis, higieniza contas conhecidas e identificadores em texto livre antes de truncar,
  e limita falas anteriores do assistente a 1.500 caracteres (ou menos para caber no prompt).
  O histórico entra como dados na geração do alerta, de `domain` global e de `system`; não entra na
  classificação nem na consulta de recuperação jurídica, que usa apenas a pergunta atual.

As rotas `/chat` e `/alerts/{id}/chat` reconhecem conversas curtas por regras
determinísticas: saudações, agradecimentos, despedidas, confirmações e perguntas
simples de identidade ou ajuda. Respondem em PT-BR com `sources: []`, sem configurar
o Gemini, carregar embeddings, consultar o banco ou chamar o LLM. A comparação ignora
caixa, acentos e pontuação; mensagens mistas, como "olá, o que diz o art. 11?", seguem
para o roteamento. A autenticação e a validação do pedido continuam obrigatórias.

Marcadores jurídicos (lei, artigo, prazo, obrigação, COAF, comunicação, penalidades,
sigilo, cadastro e registros, entre outros) escolhem `legal` sem chamar o roteador.
Exceção: "devo comunicar este alerta?" usa `decision`, pois é um pedido explícito
de apoio à decisão sem outro marcador jurídico. "O que a lei exige se eu comunicar
este alerta?" permanece `legal`. Pedidos explícitos sobre arquivar/aprofundar,
indícios a favor/contra ou o que falta decidir também dispensam classificação.
As demais mensagens passam por uma chamada curta ao Gemini, com JSON e enum fixo;
falhas, timeout ou saída inválida voltam ao caminho `legal`. A classificação recebe
somente a mensagem com números ocultados e a indicação de contexto de alerta.

`domain` explica conceitos de PLD/fraude, tipologias, sinais, score e prática de análise
sem consultar a base jurídica. A resposta pede cerca de 150 palavras, salvo pedido de
detalhe, usa um glossário versionado de tipologias, não afirma exigências legais e mantém
a decisão com o analista. Retorna `sources: []`, remove marcadores `[Fn]` e rejeita respostas
vazias com 502 `ai.provider_failed`. No chat do alerta, recebe o mesmo resumo financeiro
higienizado, com o guarda de identificadores, sem a instrução de citar fontes jurídicas.

O resumo do chat contextual inclui corte da versão ativa em `model_versions` e
distância em pontos percentuais, posição e total da fila semanal (`origin=model`),
origem com aviso de amostra de controle, versões ativa e do alerta, contribuições
positivas e negativas (% do total absoluto SHAP), agregados do fluxo semanal completo
(contrapartes em cada direção, totais GBP, percentuais entre países, em espécie e
de valores redondos), histórico de até seis semanas/decisões com códigos de motivo e
segmento K-Means quando existente. As contas nunca são serializadas. A coexistência
de entradas e saídas não prova repasse; o grafo atual não detecta ciclos.
O contexto tem até 5.000 caracteres e o prompt do chat até 8.000, com redução do
histórico e dos registros antigos quando necessário. O parecer mantém o resumo compacto.

`decision` usa geração própria, sem RAG, com cerca de 250 palavras e cinco seções
Markdown: **Indícios a favor**, **Indícios contra**, **O que falta verificar**,
**Força dos indícios: fraca | moderada | forte** (um valor e motivo na mesma linha),
**Leitura sugerida**. A última traz "Sugestão: arquivar", "Sugestão: aprofundar" ou
"Sugestão: comunicar" e "A decisão é do analista.". Não registra decisão nem afirma
crime. Retorna `sources: []`; remove `[Fn]`. Resposta vazia, título ausente ou força
inválida devolve 502 `ai.provider_failed`, sem retentativa. Os títulos são conferidos
sem diferenciar caixa ou acentos.

`out_of_scope` devolve, sem geração de resposta: "Só consigo ajudar com temas do FraudRadar:
prevenção à lavagem de dinheiro, fraude financeira, os alertas e a comunicação ao COAF.
Quer perguntar algo sobre isso?". Retorna `sources: []`. Não há recuperação, carregamento de
embeddings ou consulta a dados de alertas/domínio nos caminhos `small_talk`, `out_of_scope`
e `domain` global (apenas leitura/gravação da conversa em `public.chat_*` quando aplicável);
o `domain` contextual lê somente os dados do alerta em uma transação curta.

Respostas `legal` mantêm o RAG e a validação de citações. Pedem até 120 palavras em dois
parágrafos curtos, salvo pedido explícito de detalhe. No chat, o modelo responde diretamente sem
mencionar a base, os trechos ou as fontes no texto, os marcadores `[Fn]` são validados no servidor
e removidos do texto exibido ao cliente (mantendo `sources` no fim) e a frase padrão de parecer
definitivo não é incluída. Quando a base não cobre uma pergunta pertinente, o modelo sinaliza
`[SEM_BASE]`, o servidor remove o marcador, descarta citações e responde com `grounded: false` e
`sources: []`. Nas respostas fundamentadas, somente as fontes efetivamente citadas são retornadas,
ordenadas pelo ID original, com `title` `[F2] Lei 9.613/1998, Art. 11` e `excerpt` terminando em
`Fonte oficial: https://...`. No fallback `llm_unavailable`, o chat mantém todas as fontes
recuperadas para consulta manual; a geração de parecer devolve 503, preserva `[Fn]` no texto e não
persiste esse fallback.

O contexto contém rota, semana, ID do alerta (quando aplicável), `path` e `page_state`
(filtros e IDs visíveis na tela). A UI não envia contas ou tabelas como contexto.
Identificadores com dígitos em mensagens livres e no histórico são ocultados antes do pedido.
A API deve aplicar a pseudonimização autoritativa também a qualquer dado buscado no servidor
antes de chamar o LLM. Chaves do LLM não fazem parte do ambiente do Next.

## Demonstração e validação restante

Com NEXT_PUBLIC_USE_MOCKS=true, cada serviço usa seu arquivo services/mocks.ts.
Não há fallback silencioso no modo real. Fixtures começam na semana 2026-10-19,
com dados também em 2026-10-12; todos os períodos mockados ficam visíveis. Alterações de
decisão, parecer e aprovação vivem na memória da aba e reiniciam ao recarregar.
As taxas e as versões do modelo são exemplos, não resultados de treinamento. Os status iniciais
dos alertas simulados contam como decisões (arquivado = falso positivo confirmado), e cada semana
simulada tem 3 contas na amostra de controle.

Autenticação Supabase continua real mesmo com mocks. Nenhuma credencial ou
sessão fictícia é criada para contornar a proteção das rotas.

Validação automatizada: pnpm test (contratos, privacidade, amostragem CSV,
integração entre serviços mock e ausência de fallback), pnpm lint e pnpm build.
Pendente de ambiente real: confirmação de e-mail, recuperação e refresh de sessão
no Supabase configurado; endpoints da API; revisão visual e interação em 375 px,
teclado e leitor de tela em um navegador disponível.
