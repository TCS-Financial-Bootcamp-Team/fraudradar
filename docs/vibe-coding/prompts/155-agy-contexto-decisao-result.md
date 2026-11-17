---
id: 155
area: frontend
autor: agy (gemini-4-hydrogen-high)
pai: 153
data: 2026-11-17
---

# Resultado do agy: controle do contexto e selo de apoio à decisão

- Selo "Contexto: Alerta #id" com botão para desligar; desligado, a pergunta vai para `POST /chat`
  sem o alerta. Preferência por aba (sessionStorage, com try/catch).
- Sugestões na página do alerta: "Isso parece lavagem de verdade?", "O que pesa contra este alerta?",
  "O que falta verificar antes de decidir?" e a pergunta jurídica do COAF.
- `kind: decision`: selo "Apoio à decisão — a decisão é sua" e pílula de força (fraca, moderada,
  forte) com tokens do tema, lida da linha "Força dos indícios".
- Revisor: `pnpm lint`, `pnpm test` (118/118) e `pnpm build` passaram.
