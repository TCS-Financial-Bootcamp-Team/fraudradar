---
id: 171
area: docs
autor: Claude Code (conta 2, do Pedro)
pai: 170
data: 2026-11-21
---

# Resultado: BPMN 1 sem o COAF

- `docs/bpmn/01-aml-monitoring.bpmn`: saíram a raia do COAF, a tarefa manual "Enviar a
  comunicação ao COAF (fora do sistema)" e a mensagem até o COAF. "Revisar e aprovar a
  comunicação" agora leva direto a "Alerta encerrado", como no código (`approve_report` só aprova
  e trava o alerta; não envia nada). A anotação diz que o envio pelo Siscoaf é feito pela
  instituição fora do sistema, sem "simulação acadêmica".
- `.svg` e `.png` exportados de novo com o bpmn-js 17.11.1 (o PNG em escala 2, como antes).
- `docs/bpmn/README.md`: o texto do diagrama 1 acompanha a mudança, e a legenda perdeu "tarefa com
  mão" e "tarefa cinza", que nenhum diagrama usa mais.
- Fora do repositório: o parágrafo do pitch trocou "once a week" (o período aberto é recalculado
  a cada hora ou sob demanda) e "report to COAF" (o sistema não envia) por "keeps a short weekly
  queue" e "approve a suspicious activity report for COAF".
