---
id: 112
area: docs
autor: Claude Code (conta 2, do Pedro)
destino: Pedro
pai: 111
data: 2026-11-16
tipo: resposta
modelo: claude-opus-5-5
---

# Resultado do prompt 111: BPMN do processo

Branch `docs/bpmn`, a partir da `main` em `c9a8309`.

## O que entrou

- `docs/bpmn/`: três diagramas BPMN 2.0, cada um com o `.bpmn` (fonte editável), o `.svg` e o
  `.png`, e um README com a legenda, o resumo de cada diagrama e de onde vem cada regra no código.
  1. `01-aml-monitoring`: ponta a ponta. Fontes de dados, sistema, analista e COAF; entrada,
     processamento por intervalo ou "Processar agora", fila, parecer (planejado), decisão com
     justificativa, rascunho, aprovação e envio ao COAF fora do sistema.
  2. `02-period-processing`: entrada de dados (CSV e API tudo ou nada, importação e simulador) e o
     trabalho `process` do worker, com a semana como subprocesso repetido em ordem e a falha que
     não grava a semana.
  3. `03-model-retraining`: pedido de retreino, regras de quando ele pode rodar, treino com o
     retorno, medida contra a versão ativa, trava de promoção e promoção pelo analista.
- `docs/README.md` e a skill `fraudradar-overview` (as duas cópias) apontam para a pasta.

## Como foi feito

O fluxo foi lido no código, não no plano: `api/repositories/decisions.py`, `api/schemas/alerts.py`,
`api/domain.py`, `api/repositories/models.py`, `src/fraudradar/model/feedback.py`,
`src/fraudradar/model/eligibility.py`, `worker/jobs.py`, a tela de detalhe do alerta, o README
(seções Ingestão e Worker), `docs/analyst-feedback.md` e `docs/external-data.md`.

Os arquivos saíram de um script descartável (descrição por colunas e raias, convertida em BPMN com
coordenadas), fora do git. Foram validados no bpmn-moddle 10.3.1 e importados no bpmn-js 18.31.1
(o motor do bpmn.io e do Camunda Modeler), com zero avisos. O SVG e o PNG foram exportados do
próprio bpmn-js e conferidos olhando as imagens.

## Decisões (técnicas, reversíveis)

- Três diagramas em vez de um: num só, o texto ficaria ilegível no slide. O 1 é o da apresentação;
  o 2 e o 3 são o detalhe.
- O parecer da IA aparece no fluxo, em amarelo e anotado como planejado (a rota responde 503),
  porque faz parte do processo descrito no README. O desenho não finge que ele existe.
- O envio ao COAF é uma tarefa manual fora do sistema (cinza), com mensagem para o participante
  COAF. No código, a aprovação encerra o alerta e nada é enviado.
- Quem decide e quem aprova a comunicação estão na mesma raia: o código não exige outra pessoa.
- Nomes de arquivo e ids em inglês (regra do `AGENTS.md`); textos dos diagramas em português.

## Achados no caminho (não mexidos)

- **Segregação de funções**: o mesmo analista pode decidir comunicar e aprovar a própria
  comunicação. `approve_report` só confere que o alerta está `reported`. Em PLD de verdade, a
  aprovação costuma ser de outra pessoa (princípio dos quatro olhos). É decisão do time.
- O status `in_review` nunca é gravado pela API nem pelo worker (só aparece em testes): o alerta vai
  de `new` direto para a decisão.

## Verificação

- bpmn-moddle e bpmn-js: zero avisos nos três arquivos.
- `uv run pytest tests/test_agent_skill.py`: 3 passaram (as duas cópias da skill continuam iguais).
- A suíte inteira não rodou: só documentação mudou.

## Em aberto

- Abrir no Camunda Modeler não foi testado; o bpmn-js, que é o motor dele, importou sem aviso.
- Commit e PR esperam o Pedro.
