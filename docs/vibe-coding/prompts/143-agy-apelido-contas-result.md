---
id: 143
area: frontend
autor: agy (gemini-4-hydrogen-high)
pai: 142
data: 2026-11-17
---

# Resultado do agy: apelido fictício das contas

- `web/src/lib/account-alias.ts`: `accountAlias(conta)` determinístico (FNV-1a com mistura final), animal + cor/material + sufixo base-36, igual em PT-BR e EN.
- `web/src/components/account-label.tsx`: apelido em destaque e o número da conta em fonte mono, com dica "Apelido fictício ... Não é um nome real."
- Onde aparece: fila de alertas, contas suspeitas, "Comece por aqui" do dashboard, cabeçalho do alerta, movimentos da semana, "Outras semanas desta conta" e o grafo de conexões (rótulo com o apelido; dica com apelido e número).
- Não sai da tela: nenhum service, o assistente, o modal do parecer nem o relato ao COAF importa o apelido (conferido por busca pelo revisor).
- Revisor (Claude): `pnpm lint`, `pnpm test` (112/112) e `pnpm build` passaram.

Ajustes do revisor na mesma rodada (backend): `split_grouped_citations` em `src/fraudradar/ai/legal_generation.py` separa "[F2, F3]" em "[F2] [F3]", porque o teste real com o Gemini mostrou uma fonte citada sumindo da lista; teste em `tests/test_legal_chat_config.py`. Teste real com o Gemini (`gemini-3.5-flash-lite`): saudação sem fontes, pergunta jurídica com 83 palavras, parecer do alerta 866 com as seis seções e o resumo extraído.
