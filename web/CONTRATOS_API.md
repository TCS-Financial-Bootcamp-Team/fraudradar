# Contratos do frontend

Os schemas Zod em `src/features/*/schemas/` são a referência executável.
Todas as respostas são JSON, exceto o pedido multipart de CSV. Erros HTTP
não são convertidos em sucesso nem em mocks. As rotas de domínio exigem
`Authorization: Bearer <access_token do Supabase>`. A API deve validar o JWT
e autorizar os dados; o proxy do frontend não substitui a autorização da API.

Datas de semana: `AAAA-MM-DD`; timestamps: ISO 8601. Score e contribuições:
0–100. Taxas: frações de 0–1. Valores monetários nos indicadores: BRL.
A normalização/conversão dos valores é responsabilidade da API.

## Alertas e monitoramento

| Requisição                             | Pedido / resposta assumida                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| GET /alertas                           | Query: semana, status e pais opcionais; pagina (base 1), tamanho=10, ordenar=score_desc. Resposta: filaSchema. |
| GET /alertas/{id}                      | detalheSchema: resumo, contribuicoes, regras, movimentacoes e parecer anulável.                                |
| GET /alertas/{id}/grafo                | grafoSchema: nos e arestas, com IDs/rotulos de contas pseudonimizados. Até dois saltos.                        |
| POST /alertas/{id}/parecer             | Pedido {}; resposta parecerSchema com texto e fontes {titulo, trecho}.                                         |
| POST /alertas/{id}/decisao             | decisaoSchema: decisao e justificativa; resposta alertaSchema atualizado.                                      |
| GET /alertas/{id}/comunicacao          | comunicacaoSchema: alerta_id, texto, status, atualizado_em.                                                    |
| POST /alertas/{id}/comunicacao/aprovar | aprovacaoSchema: {texto}; resposta comunicacaoSchema atualizado. A edição é persistida junto da aprovação.     |
| POST /alertas/{id}/chat                | pedidoChatSchema; resposta respostaChatSchema.                                                                 |
| POST /replay/proxima-semana            | Pedido {}; resposta replaySchema: {semana, alertas_gerados}. A API controla a progressão e a idempotência.     |
| GET /monitoramento?semana=             | monitoramentoSchema, usado pelo dashboard e pela tela de qualidade.                                            |
| GET /saude                             | saudeSchema, compatível com o contrato anterior.                                                               |

Status de alerta: pendente, aprofundar, arquivado, comunicar.
Decisão: arquivar, aprofundar, comunicar. Justificativa: 10–4000 caracteres.
Comunicação: rascunho ou aprovada; texto: 30–20000 caracteres para aprovação.

A fila retorna `{itens, total, paises}`. `total` é o total filtrado antes da
paginação; `paises` é o catálogo disponível para o filtro e não deve sumir
quando um país for selecionado. A API deve ordenar por score antes de paginar.

O detalhe contém contas pseudonimizadas, dados financeiros, regras e
contribuições já calculadas. O frontend não calcula features ou score.

Monitoramento retorna:

- semana;
- indicadores: alertas, revisados, comunicados, taxa_alerta, valor_sinalizado,
  recall, acerto_tipologia;
- semanas, tipologias, paises, taxa_paises e taxa_meios: listas {nome, valor}.

A série semanal inclui o histórico até a semana de referência. Métricas de
qualidade são resultados de avaliação, sem expor rótulos ao modelo ou à UI.

A lista de comunicações usa a fila paginada com status=comunicar e consulta o
rascunho de cada alerta. Não foi inventado um GET /comunicacoes. Para um volume
grande, o time deve fornecer uma coleção paginada para evitar várias consultas.

**Nada é enviado ao COAF.** O indicador de comunicados representa aprovações
simuladas neste produto acadêmico. Validar esse rótulo com o responsável do produto.

## Ingestão: contratos novos

| Requisição                               | Pedido / resposta                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| POST /ingestao/csv                       | multipart/form-data com campo arquivo (File); resposta reciboSchema.                           |
| POST /ingestao/transacoes                | transacaoSchema com as 11 colunas transacionais; resposta reciboSchema.                        |
| POST /ingestao/conexoes                  | conexaoSchema: {nome, tipo: "postgres", connection_string, ssl}; resposta fonteSchema.         |
| GET /ingestao/conexoes                   | fontesSchema: {itens: Fonte[]}.                                                                |
| POST /ingestao/conexoes/{id}/sincronizar | **Endpoint adicional assumido** para a ação de sincronização. Pedido {}; resposta fonteSchema. |
| POST /chat                               | pedidoChatSchema; resposta respostaChatSchema.                                                 |

`reciboSchema`: {id, status: recebido | processando | concluido, mensagem}.
Recebimento do arquivo não significa conclusão do processamento.

`fonteSchema`: {id, nome, tipo: postgres, host_mascarado, banco_mascarado,
status: conectada | sincronizando | erro, ultima_sincronizacao: string | null}.
**Nunca retornar URI, usuário ou senha.** A API guarda as credenciais, define os
destinos permitidos para conexão e executa a leitura/sincronização no servidor.
O frontend não se conecta a bancos. O envio exige HTTPS, com exceção de localhost
para desenvolvimento. O sinalizador ssl refere-se à conexão API → Postgres.

O formulário aceita URI ou monta a URI a partir de host/porta/banco/usuário/senha,
codificando os componentes. Os campos secretos são limpos após a tentativa de
cadastro, não entram em localStorage e não são usados no chat.

O CSV deve conter exatamente as 11 chaves de transacaoSchema, sem colunas de
avaliação. A prévia usa PapaParse em blocos de 64 KiB, com preview=20 e limite
defensivo de 1 MiB. O arquivo original segue por multipart, sem ser convertido
integralmente para JSON. A validação local cobre somente a amostra: a API precisa
validar todas as linhas, rejeitar colunas extras e definir limites de upload.

Datas: AAAA-MM-DD; horário: HH:MM ou HH:MM:SS; valor numérico positivo.
Os catálogos de moedas, países e meios são sugestões pesquisáveis. Nomes de
moedas do arquivo SAML-D são preservados; validar normalização e catálogo oficial
com o time da API. Não há inferência de taxa de câmbio no cliente.

## Chat e privacidade

Pedido: {mensagem, contexto: {pagina, semana, alerta_id?}, historico}.
Histórico: até 20 entradas {papel: usuario | assistente, texto}.
Resposta: {resposta, fontes: [{titulo, trecho}]}.

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
