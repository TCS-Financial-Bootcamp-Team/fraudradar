---
id: 169
area: docs
autor: Claude Code (conta 2, do Pedro)
pai: 168
data: 2026-11-19
---

# Resultado: VibeLog removido, documento das etapas e README completo

Tarefa só de documentação e remoção de pasta; a IA fez direto, sem delegar.

- **VibeLog**: a pasta `vibelog/` saiu do repositório. As referências vivas foram tiradas de
  `CONTRIBUTING.md` (o registro dos prompts agora é só em Markdown), `docs/glossary.md` e das
  skills `fraudradar` e `fraudradar-overview` (as duas cópias). Os registros antigos em
  `docs/vibe-coding/prompts/` que citam o VibeLog ficaram como estão: são histórico.
- **Revisão contra `docs/project-requirements.md`**: tudo o que o bootcamp pede está no
  repositório, menos o documento das etapas, que só existia fora dele. A IA escreveu
  `docs/development-process.md` a partir do histórico de PRs (#1 a #34). Os slides continuam
  fora do repositório. Pendência real que segue aberta: a revisão humana do texto da Circular
  BCB 3.978/2020 no RAG.
- **README**: reescrito com tema e objetivo, a tabela de requisitos do bootcamp com onde cada
  um está, fluxo, telas, arquitetura, tecnologias, dados e números do modelo, IA generativa,
  estrutura, três formas de rodar (só o front com dados simulados, sistema completo, Terraform),
  variáveis, testes e CI, a API inteira (entraram `GET /health`, `GET /ai/models` e as rotas do
  histórico de conversas, que faltavam), o worker, os documentos e as limitações. O upgrade
  `009_chat.sql`, que faltava na lista, entrou.
- `db/rules/README.md` ainda dizia que as regras estavam "a escrever"; agora tem a tabela das
  cinco regras.
