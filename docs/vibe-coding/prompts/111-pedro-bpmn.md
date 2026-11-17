---
id: 111
area: docs
autor: Pedro
destino: Claude Code (conta 2, do Pedro)
pai: null
data: 2026-11-16
---

# O que falta para finalizar o projeto, e os BPMN

> oque falta pra finalizarmos o projeto

Resposta do Claude no chat (resumo, lido nas branches e pastas, sem rodar a suíte):

- **Entregáveis do bootcamp que não existem no repositório**: slides, documento das etapas e BPMN.
  Os notebooks oficiais (`notebooks/01` a `04`) também não existem, e são eles que provam a
  limpeza e a análise dos dados.
- **Código pronto fora da `main`**:
  - `feat/i18n` (troca de idioma) ainda sem PR;
  - `feat/integracao-web-rag` (RAG da frente 3) está 68 commits atrás da `main`, e o commit
    `d081c2c` reescreve uns 100 arquivos do `web/` com uma versão antiga do front, então o merge
    direto desfaria o redesenho e o i18n. Só o backend (`src/fraudradar/ai/`, `rag/`,
    `api/legal_chat_service.py`, testes) deve entrar. A branch também mexe no monitoramento e nas
    dependências da API e traz um Terraform da Oracle;
  - `yuji` tem a análise exploratória e o LSTM em `lab/`.
- **Responde 503 ou está vazio**: o parecer por alerta, até na branch do RAG (só o `/chat`
  genérico ficou pronto); as regras de cenário (`db/rules/`); a base do RAG, que só tem a Lei
  9.613.
- Ordem sugerida: fechar a `feat/i18n`; trazer só o backend do RAG; o parecer por alerta;
  notebooks oficiais; BPMN e documento das etapas já, e os slides por último.

> voce consegue produzir os bpmn ?

Resultado: `112-claude-conta2-bpmn-result.md`.
