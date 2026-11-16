---
id: 113
area: geral
autor: Pedro
destino: Claude Code (conta 2, do Pedro)
pai: null
data: 2026-11-16
---

# README em dia? Mergear tudo na main (menos a branch do Yuji) e configurar o front

> o readme esta condizente com o estado atual do projeto ?

Resposta do Claude no chat (resumo, lido na `main` em `c9a8309`, sem mudar nada): não por inteiro.
A parte de referência (rotas, ingestão, worker) bate com o código, mas:

- quem segue o "Como rodar" fica preso no `/login`: o Supabase está vazio no `.env.example` e o
  `web/src/proxy.ts` redireciona. Depois vê dados simulados (`NEXT_PUBLIC_USE_MOCKS=true`, que o
  README não cita) e fica sem modelo (`models/` fica fora do git e falta o passo de treino);
- descreve como prontos o parecer do LLM, as regras de cenário, os notebooks `01` a `04` e o
  conteúdo de `ai/` e `rag/`, que não existem. Também diz que as conexões externas respondem 501,
  mas elas existem desde o PR #16;
- faltam ML e IA na tabela de tecnologias, os prompts do vibe-coding, as telas e parte das pastas
  e comandos.

A correção do README espera o Pedro decidir como os avaliadores vão fazer login.

> o vitor fez a pull ai, veja se jada pra mergear tudo na main, com exeção da branch do yuji

> (colado no chat) Configure estas variáveis no frontend do FraudRadar: `NEXT_PUBLIC_API_URL`,
> `NEXT_PUBLIC_USE_MOCKS=false`, `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
>
> ai ta as credenciais necessarias na branch do vitor

Os valores ficam fora deste registro: a URL é a da API do Victor na Oracle, e a chave é a
publicável do Supabase do time.

> se precisar escrever codigo, voce pode usar o codex e o agy (o hydrogen 4)

> quando acabar ai faz os diagramas der do sistema tambem

Resultado do merge: `114-claude-conta2-merge-result.md`. Os diagramas DER têm registro próprio.
