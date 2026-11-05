---
id: 047
area: docs
autor: Pedro
destino: Claude Code (conta 1)
pai: null
data: 2026-11-05
---

alem disso, crie outra skill, explicando completamente oque é o projeto, estrutura de pastas etc etc

(Resposta: skill `fraudradar-overview` em `.agents/skills/fraudradar-overview/SKILL.md`,
com cópia em `.claude/skills/`: o que o sistema faz, o fluxo de ponta a ponta, o domínio,
o SAML-D, a stack, cada pasta, as 14 tabelas, as rotas, as telas, o VibeLog, como rodar,
testes e CI, as frentes e o estado em 05/11/2026. As afirmações foram conferidas no código
(duas estavam erradas no primeiro rascunho e foram corrigidas: a tela de monitoramento usa
`features/alerts`, e `/health` também informa modelo e LLM). A skill `fraudradar` e o
`AGENTS.md` passaram a apontar para ela, e o `tests/test_agent_skill.py` agora confere
todas as skills das duas pastas, não só uma.)
