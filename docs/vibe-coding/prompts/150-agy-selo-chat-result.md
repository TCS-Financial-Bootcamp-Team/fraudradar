---
id: 150
area: frontend
autor: agy (gemini-4-hydrogen-high)
pai: 148
data: 2026-11-17
---

# Resultado do agy: selo do tipo de resposta

- `kind` opcional no schema do chat; sem `kind` (API antiga), vale `legal` quando há fontes e nenhum
  selo quando não há.
- Selos: "Com base na Lei 9.613/1998" (jurídica, com o "Fontes (N)" recolhido) e "Resposta geral, sem
  fonte jurídica" (conceito, com dica); conversa e fora do escopo sem selo.
- Sugestões no assistente: "O que é a tipologia fan-out?", "O que a lei exige ao comunicar ao COAF?" e,
  na página do alerta, "O que verificar primeiro neste alerta?". Mocks com os quatro tipos.
- Revisor: `pnpm lint`, `pnpm test` (115/115) e `pnpm build` passaram.
