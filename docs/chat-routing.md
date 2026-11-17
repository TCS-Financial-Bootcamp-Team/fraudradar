# Roteamento do chat

`POST /chat` e `POST /alerts/{id}/chat` respondem `{kind, answer, sources}`.
O campo `kind` é obrigatório e identifica o caminho usado:

| `kind` | Resposta | Recuperação jurídica |
| --- | --- | --- |
| `small_talk` | Texto fixo de saudação, ajuda ou cortesia; fontes vazias | Não |
| `legal` | Exigências legais com citações validadas e fontes revisadas | Sim |
| `domain` | Conceitos de PLD/fraude, tipologias e prática de investigação; fontes vazias | Não |
| `out_of_scope` | Texto fixo explicando o escopo do FraudRadar; fontes vazias | Não |

O pedido permanece `{message, context: {page, week, alert_id?}, history}`. O histórico
não é enviado ao modelo. Perguntas sobre um alerta usam a rota contextual; `/chat`
rejeita `context.alert_id`. A autenticação e os controles de identificadores continuam
obrigatórios em todos os caminhos. O chat global também recusa números curtos
explicitamente identificados como conta, com o mesmo erro `ai.chat_personal_data`.

## Classificação e falhas

O classificador determinístico de conversa curta roda primeiro. Marcadores de lei,
artigo, prazo, obrigação, dever, COAF, comunicação, penalidade, multa, sanção,
Circular, Resolução, BCB, 9.613, LGPD, sigilo, cadastro de clientes e registro de
transações escolhem `legal`, independentemente do que o LLM escolheria. Esses dois
atalhos dispensam a chamada de classificação.

As outras perguntas passam por uma chamada ao mesmo modelo Gemini configurado,
com temperatura zero, limite de 64 tokens de saída, timeout de 10 segundos (o mínimo aceito pela API do Gemini) e sem
retentativas. A saída é JSON com `route` limitado aos quatro valores do contrato.
Falhas do provedor, timeout, JSON inválido e valores fora do enum escolhem `legal`.
O roteador não transforma essas falhas em 500; o caminho jurídico ainda pode retornar
seus erros usuais de configuração, fontes ou provedor.

O prompt de sistema fica em `src/fraudradar/ai/chat_router.py`, separado do JSON de
dados. A classificação recebe a mensagem com números, e-mails e URLs ocultados e
`has_alert_context`, sem dados do banco. Entradas do usuário e documentos recuperados
são dados, nunca instruções. Não há registro de texto das mensagens nem de contas.

## Respostas de domínio

"Explique a tipologia fan-out" usa `domain`: explica dispersão de uma conta para
vários destinatários, sem buscar artigos. "O que verificar primeiro neste alerta?"
usa o resumo financeiro preparado e higienizado no servidor, após fechar a conexão.
Esse resumo e o prompt passam pelo mesmo guarda de identificadores do caminho jurídico,
sem a instrução de citar fontes. Nenhuma resposta determina que houve crime.

`DOMAIN_SYSTEM_INSTRUCTION` pede respostas diretas em PT-BR, com cerca de 150 palavras,
salvo pedido de detalhe. Proíbe afirmações de obrigações, prazos e artigos. Se esses temas
chegarem ao gerador, ele orienta a perguntar "o que a lei exige sobre ..." e encerra.
O código remove marcadores `[Fn]` e rejeita texto vazio, inclusive após a remoção,
com 502 `ai.provider_failed`. Respostas de domínio nunca retornam fontes.

O glossário em `src/fraudradar/ai/typology_glossary.py` cobre os 17 códigos de
`TYPOLOGY_LABELS`, como referência conceitual, sem ler gabarito. `src/fraudradar/data`
não contém catálogo enumerado das tipologias normais; nenhum código normal foi
inventado. A referência ressalta que padrões como fan-out e fan-in também podem
ocorrer em atividades legítimas. As variantes de mudança de comportamento são descritas
sem atribuir uma causa que o código do dataset sozinho não sustenta.

## Escopo e recursos

"Quando o Titanic afundou?" usa `out_of_scope` e recebe exatamente:

> Só consigo ajudar com temas do FraudRadar: prevenção à lavagem de dinheiro, fraude financeira, os alertas e a comunicação ao COAF. Quer perguntar algo sobre isso?

Além da classificação, esse caminho não chama o LLM. `small_talk`, `out_of_scope` e
`domain` global não carregam embeddings nem acessam o banco. `domain` contextual
lê apenas os dados do alerta. A geração de parecer continua usando o RAG jurídico,
sem passar pelo roteador. O contrato completo está em `web/API_CONTRACTS.md`.
