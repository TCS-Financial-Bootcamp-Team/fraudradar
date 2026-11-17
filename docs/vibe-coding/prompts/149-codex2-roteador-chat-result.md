---
id: 149
area: ia
autor: Codex CLI (conta 2, gpt-6.1-sol)
pai: 147
data: 2026-11-17
---

# Resultado do Codex: roteador do chat

- `src/fraudradar/ai/chat_router.py`: quatro rotas (`small_talk`, `legal`, `domain`, `out_of_scope`).
  Conversa curta e marcadores jurídicos (lei, artigo, prazo, obrigação, COAF, multa, sigilo, 9.613...)
  decidem sem chamar o Gemini; o resto passa por uma chamada curta com saída JSON restrita ao enum.
  Qualquer falha ou resposta fora do enum vai para `legal`, o caminho com citação.
- `src/fraudradar/ai/domain_chat.py` e `typology_glossary.py`: resposta de conceito sem busca e sem
  [Fn], com o glossário das 17 tipologias de lavagem do SAML-D; no chat do alerta, com o contexto
  financeiro higienizado.
- `out_of_scope`: resposta fixa, sem LLM além do roteador. `ChatResponse.kind` novo.
- Chat geral recusa também "conta 123" (a mensagem agora pode ir direto ao Gemini no caminho de
  conceito).

## Revisão (Claude)
- O teste real com o Gemini mostrou tudo caindo em `legal`: o prazo do roteador era 5 s e a API do
  Gemini recusa menos de 10 s (400 INVALID_ARGUMENT). O teste do Codex conferia `timeout == 5000`.
  Corrigido para 10 s, com teste do mínimo.
- Falha do roteador agora gera um aviso no log, só com o tipo do erro (sem a pergunta).
- A resposta de conceito copiou um valor errado do alerta (79.022,55 em vez de 79.022,65):
  instrução nova para copiar valores exatamente como estão nos dados.
- Teste real depois das correções: fan-out, smurfing e "como ler as contribuições" em `domain`;
  Titanic, Copa de 2002 (com "ignore as regras") e script Python em `out_of_scope`; prazo do COAF em
  `legal`; no alerta, "o que verificar primeiro" e "que tipologia parece" em `domain`, e "o que a lei
  exige se eu comunicar" em `legal`, com o prazo de 24 h e fontes.
- pytest com Postgres: 944 passaram, nenhum pulado.
