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
| GET /alerts                         | Query: week obrigatória; status, country e search opcionais; page (base 1), size=10, sort=score_desc. Resposta: queueSchema.     |
| GET /alerts/{id}                    | alertDetailSchema: resumo, contributions, rules, movements e assessment anulável.                            |
| GET /alerts/{id}/graph              | graphSchema: nodes e edges, com IDs/labels de contas pseudonimizados. Até dois saltos.                       |
| POST /alerts/{id}/assessment        | Pedido {}; resposta assessmentSchema com content e sources {title, excerpt}.                                 |
| POST /alerts/{id}/decision          | decisionSchema: decision e justification; resposta alertSchema atualizado.                                   |
| GET /alerts/{id}/report             | reportSchema: alert_id, content, status, updated_at.                                                         |
| POST /alerts/{id}/report/approve    | approvalSchema: {content}; resposta reportSchema atualizado. A edição é persistida junto da aprovação.       |
| POST /alerts/{id}/chat              | chatRequestSchema; resposta chatResponseSchema.                                                              |
| GET /weeks                          | weeksSchema: {current, next_release, items}. Só as semanas liberadas entram no seletor; next_release nulo desliga o replay. |
| POST /replay/next-week              | Pedido {}; resposta replaySchema: {week, alerts_generated}. A API controla a progressão e a idempotência.    |
| GET /monitoring?week=               | monitoringSchema, usado pelo dashboard e pela tela de qualidade.                                             |
| GET /health                         | healthSchema, compatível com o contrato anterior.                                                            |

Status de alerta: pending, escalated, archived, reported.
Decisão: archive, escalate, report. Justificativa: 10–4000 caracteres.
Comunicação: draft ou approved; content: 30–20000 caracteres para aprovação.

A fila retorna `{items, total, countries}`. `total` é o total filtrado antes da
paginação (reflete os filtros de status, país e busca); `countries` é o catálogo
disponível para o filtro na semana e não deve sumir quando um país for selecionado.
A API deve ordenar por score antes de paginar.

O detalhe contém contas pseudonimizadas, dados financeiros, regras e
contribuições já calculadas. O frontend não calcula features ou score.

Monitoramento retorna:

- week;
- indicators: alerts, reviewed, reported, alert_rate, flagged_amount,
  recall (anulável), typology_accuracy (anulável);
- weeks, typologies, countries, country_rates, payment_type_rates, recall_series e score_histogram: listas {name, value};
- status_counts: contagem por status do alerta ({pending, escalated, archived, reported}).

A série semanal inclui o histórico até a semana de referência. Métricas de
qualidade são resultados de avaliação, sem expor rótulos ao modelo ou à UI.

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

`datasetSchema`: `{slug, name, origin: "saml-d" | "external",
active_model_version: string | null, created_at}`. O slug aceita somente
`[a-z0-9-]{1,40}`. A tela guarda o slug atual no `localStorage`, com fallback
seguro para `saml-d`; a troca limpa a semana selecionada e recarrega os recursos.

`jobSchema`: `{id, kind: "import" | "process" | "train", dataset, status:
"queued" | "running" | "done" | "failed", progress, message, created_at,
started_at, finished_at}`. Nesta fase, só `process` executa trabalho real;
`import` e `train` falham com mensagem explícita de que ainda não foram implementados.

## Chat e privacidade

Pedido: {message, context: {page, week, alert_id?}, history}.
Histórico: até 20 entradas {role: user | assistant, content}.
Resposta: {answer, sources: [{title, excerpt}]}.

O contexto contém somente rota, semana e ID do alerta. A UI não envia contas
ou tabelas como contexto. Identificadores com dígitos em mensagens livres e no
histórico são ocultados antes do pedido. A API deve aplicar a pseudonimização
autoritativa também a qualquer dado buscado no servidor antes de chamar o LLM.
Chaves do LLM não fazem parte do ambiente do Next.

## Demonstração e validação restante

Com NEXT_PUBLIC_USE_MOCKS=true, cada serviço usa seu arquivo services/mocks.ts.
Não há fallback silencioso no modo real. Fixtures começam na semana 2026-10-19,
com dados também em 2026-10-12; o replay gera a próxima semana. Alterações de
decisão, parecer e aprovação vivem na memória da aba e reiniciam ao recarregar.
As taxas de qualidade são exemplos, não resultados de treinamento.

Autenticação Supabase continua real mesmo com mocks. Nenhuma credencial ou
sessão fictícia é criada para contornar a proteção das rotas.

Validação automatizada: pnpm test (contratos, privacidade, amostragem CSV,
integração entre serviços mock e ausência de fallback), pnpm lint e pnpm build.
Pendente de ambiente real: confirmação de e-mail, recuperação e refresh de sessão
no Supabase configurado; endpoints da API; revisão visual e interação em 375 px,
teclado e leitor de tela em um navegador disponível.
