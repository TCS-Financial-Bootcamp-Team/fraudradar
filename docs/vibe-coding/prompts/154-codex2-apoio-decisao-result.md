---
id: 154
area: ia
autor: Codex CLI (conta 2, gpt-6.1-sol)
pai: 152
data: 2026-11-17
---

# Resultado do Codex: contexto rico do alerta, memória e apoio à decisão

- `api/repositories/alert_ai_context.py`: corte da versão ativa, distância ao corte, posição e total
  da fila, origem (amostra de controle), contribuições positivas e negativas, forma do fluxo da
  semana (contrapartes de entrada e saída, GBP, % exterior, % espécie, % valores redondos, entrada e
  saída na mesma semana), histórico de alertas e decisões da conta com códigos de motivo (sem a
  justificativa em texto livre) e segmento K-Means. Nenhuma consulta lê o gabarito.
- Memória: últimas 6 mensagens, higienizadas; a busca jurídica usa só a pergunta atual.
- Rota `decision` (só no chat do alerta) com cinco seções validadas: Indícios a favor, Indícios
  contra, O que falta verificar, Força dos indícios, Leitura sugerida ("A decisão é do analista").

## Revisão (Claude), com o Gemini real
- Validação recusava respostas boas: o modelo copiava o molde "fraca | moderada | forte" no título
  e punha o valor na linha de baixo. Instrução reescrita com marcadores entre colchetes e validação
  que aceita esse deslize específico (com teste e controle negativo).
- Texto expunha nomes de campo do JSON e números em formato americano: instrução pede nomes em
  português e formato brasileiro (42,5; 27,5%; £ 129,70).
- Bug: pergunta jurídica no alerta (ou queda para o caminho jurídico quando o roteador falha) dava
  500, porque o contexto completo com histórico passava dos 2000 caracteres de `answer_legal_chat`.
  O caminho jurídico voltou ao resumo compacto, sem histórico; teste de regressão. Quatro testes do
  Codex assumiam essa combinação e foram ajustados (um passou a esperar o 422 explícito que a main
  já dava para pergunta longa demais).
- Teste real: alerta 2773 (nota 42,5, corte 42,3, £ 129,70 em 2 saques) -> força fraca; alerta 3073
  (nota 100) -> força forte, sugestão aprofundar. Na mesma conversa com histórico: decisão, jurídica
  (2 fontes), conceito e fora do escopo, todas 200.
- pytest com Postgres: 1006 passaram, nenhum pulado.
