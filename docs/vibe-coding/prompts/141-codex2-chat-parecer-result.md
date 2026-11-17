---
id: 141
area: ia
autor: Codex CLI (conta 2, gpt-6.1-sol)
pai: 139
data: 2026-11-17
---

# Resultado do Codex: chat conversacional e parecer com resumo

- `src/fraudradar/ai/legal_chat_intent.py`: saudação, agradecimento, despedida, "ok" e "quem é você" recebem resposta fixa, sem busca, sem banco e sem LLM; mensagem com termo jurídico ou com mais de 6 palavras segue para a busca. O revisor (Claude) acrescentou "tudo bem", "tudo bom" e "como vai" ao fim de uma saudação ("Oi, tudo bem?"), com testes.
- Instrução do chat: resposta direta, até ~120 palavras, só com evidências relevantes. O parecer usa instrução própria com seções fixas (Resumo, Sinais de risco, Contexto transacional, Fundamentação jurídica, Limitações, Próximos passos) e 1500 tokens de saída.
- O chat e o parecer devolvem só as fontes citadas, mantendo os ids; título "[F1] Lei 9.613/1998, Art. 11".
- `Assessment.summary` calculado a partir do conteúdo (seção Resumo ou, nos pareceres antigos, o primeiro parágrafo), sem coluna nova.
- Verificação do revisor: `ruff check`, `ruff format --check` e `pytest` com Postgres: 848 passaram, nenhum pulado. Chamada real ao Gemini não testada (sem chave local).
- Limitação conhecida: o título das fontes fixa "Lei 9.613/1998", válido enquanto a base tiver só essa lei.
