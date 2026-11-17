# Roteamento do chat

`POST /chat` e `POST /alerts/{id}/chat` respondem `{kind, answer, sources}`.
O campo `kind` é obrigatório e identifica o caminho usado:

| `kind` | Resposta | Recuperação jurídica |
| --- | --- | --- |
| `small_talk` | Texto fixo de saudação, ajuda ou cortesia; fontes vazias | Não |
| `legal` | Exigências legais com citações validadas e fontes revisadas | Sim |
| `domain` | Conceitos de PLD/fraude, tipologias e prática de investigação; fontes vazias | Não |
| `decision` | Apoio à decisão sobre o alerta, com indícios a favor e contra; fontes vazias | Não |
| `out_of_scope` | Texto fixo explicando o escopo do FraudRadar; fontes vazias | Não |

O pedido permanece `{message, context: {page, week, alert_id?}, history}`. As últimas
seis mensagens (papel e conteúdo) entram no prompt do alerta e do domínio global,
como dados, nunca instruções. Falas do assistente são limitadas a 1.500 caracteres,
com redução adicional para caber no orçamento do prompt. Contas conhecidas, números
longos, contas curtas explicitamente identificadas, e-mails e URLs são ocultados antes
do truncamento. Histórico não entra na classificação nem na consulta de recuperação
jurídica: a busca usa somente a pergunta atual higienizada. Perguntas sobre um alerta usam a rota contextual; `/chat`
rejeita `context.alert_id`. A autenticação e os controles de identificadores continuam
obrigatórios em todos os caminhos. O chat global também recusa números curtos
explicitamente identificados como conta, com o mesmo erro `ai.chat_personal_data`.

## Classificação e falhas

O classificador determinístico de conversa curta roda primeiro. Marcadores de lei,
artigo, prazo, obrigação, dever, COAF, comunicação, penalidade, multa, sanção,
Circular, Resolução, BCB, 9.613, LGPD, sigilo, cadastro de clientes e registro de
transações escolhem `legal`, independentemente do que o LLM escolheria. A exceção é
estreita: pedidos explícitos de decisão que mencionam comunicar este alerta, sem outro
marcador jurídico. "Devo comunicar este alerta?" usa `decision`; "o que a lei exige se
eu comunicar este alerta?" continua `legal`. Pedidos explícitos de arquivar, aprofundar,
avaliar indícios a favor/contra ou o que falta para decidir também têm atalho.
Sem contexto de alerta, `decision` vira `domain`, inclusive quando predita pelo LLM.

As outras perguntas passam por uma chamada ao mesmo modelo Gemini configurado,
com temperatura zero, limite de 64 tokens de saída, timeout de 10 segundos (o mínimo aceito pela API do Gemini) e sem
retentativas. A saída é JSON com `route` limitado aos cinco valores do contrato.
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

## Contexto financeiro e apoio à decisão

O chat recebe até 5.000 caracteres de contexto financeiro e até 8.000 no prompt
montado, incluindo pergunta e histórico. A pergunta HTTP continua limitada a 2.000.
O parecer mantém seu resumo compacto e o limite de 2.000 caracteres de prompt.
Todos os campos e o prompt final passam pelo guarda de identificadores. Colisões
de uma conta com um inteiro de data ou contagem bloqueiam o envio; números decimais
financeiros não são tratados como tokens inteiros de conta.

Além de score, volume, regras e métodos de pagamento, o contexto traz:

- Corte da versão selecionada em `public.datasets` (ou a ativa de `model_versions`
  quando não há seleção), lido em `model_versions`, distância em pontos percentuais,
  posição e quantidade de alertas da fila do modelo na semana. A versão do alerta e a
  ativa ficam explícitas: se diferirem, o corte atual é referência, não explica a seleção histórica.
- Origem `model` ou `exploration`, com aviso explícito de amostra de controle fora da fila.
- Quatro maiores contribuições positivas e quatro negativas da transação de maior score,
  com rótulos de `feature_label` e percentuais do total absoluto SHAP, incluindo no
  denominador as contribuições omitidas. Isso difere do percentual só das positivas do detalhe HTTP.
- Fluxo da semana completa, sobre as mesmas transações usadas pelo grafo: contagens de
  contrapartes em cada direção, totais GBP, percentuais por quantidade entre países,
  em espécie e de valores positivos múltiplos de 1.000 GBP. Entradas e saídas na mesma
  semana não provam repasse dos mesmos fundos. O grafo atual não detecta ciclos;
  nenhum resultado de detecção de ciclos é inventado ou enviado.
- Até seis semanas anteriores da conta com score, status, origem e última decisão;
  até seis decisões com códigos de motivo. As consultas não selecionam justificativas
  livres. O segmento K-Means só aparece quando persistido; não implica risco ou crime.

O resumo pode reduzir registros antigos e descrições para caber no orçamento.
As contas de todas as transações da semana, inclusive as omitidas da amostra de 200
movimentos, alimentam o guarda; só agregados do fluxo chegam ao modelo.
Não há consultas ao gabarito ou alteração de esquema.

`DECISION_SYSTEM_INSTRUCTION` exige cerca de 250 palavras em Markdown, exatamente:

1. **Indícios a favor**, com números copiados dos dados.
2. **Indícios contra**, incluindo margem do corte, sinais negativos, amostra de controle
   quando aplicável e hipóteses benignas claramente qualificadas.
3. **O que falta verificar**, com verificações de contrapartes, histórico e documentação.
4. **Força dos indícios: fraca | moderada | forte**, escolhendo um valor e explicando o motivo.
5. **Leitura sugerida**, com "Sugestão: arquivar", "Sugestão: aprofundar" ou
   "Sugestão: comunicar", e "A decisão é do analista.".

Não há decisão registrada automaticamente, afirmação de crime ou citação jurídica.
O validador remove `[Fn]` e confere os cinco títulos em ordem, sem diferenciar caixa
ou acentos, além da força válida e da sugestão. Resposta vazia ou inválida devolve
502 `ai.provider_failed`, sem retentativa. `decision` só é exposta na rota do alerta.

## Escopo e recursos

"Quando o Titanic afundou?" usa `out_of_scope` e recebe exatamente:

> Só consigo ajudar com temas do FraudRadar: prevenção à lavagem de dinheiro, fraude financeira, os alertas e a comunicação ao COAF. Quer perguntar algo sobre isso?

Além da classificação, esse caminho não chama o LLM. `small_talk`, `out_of_scope` e
`domain` global não carregam embeddings nem acessam o banco. `domain` contextual
lê apenas os dados do alerta. A geração de parecer continua usando o RAG jurídico,
sem passar pelo roteador. O contrato completo está em `web/API_CONTRACTS.md`.
