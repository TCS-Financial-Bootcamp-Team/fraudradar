---
id: 033
area: docs
autor: Pedro
destino: Claude Code (conta 1)
pai: null
data: 2026-11-05
---

crie uma skill de ia pro repositorio, que vai servir pra todas as IAs inclusive dos outros menbros do grupo (vai pro git), instrua elas sobre o projeto, padroes de commit, que qualquer testes ou brincadeiras com o dataset deve ser feito na pasta laboratorio, que todo o prompt relacionado a construção do projeto precisa ser documentado etc

(Resposta: skill `fraudradar` em `.agents/skills/fraudradar/SKILL.md`, lida por Codex,
Cursor, Copilot e Gemini, com cópia idêntica em `.claude/skills/fraudradar/SKILL.md`
para o Claude Code. O `tests/test_agent_skill.py` falha se as cópias divergirem. A pasta
`laboratorio/` já se chama `lab/` desde a passagem para inglês; a skill manda todo
experimento com o SAML-D para `lab/<pessoa>/`. O `AGENTS.md` e o `CONTRIBUTING.md`
passaram a apontar para a skill, para as IAs que não carregam skills sozinhas.)
