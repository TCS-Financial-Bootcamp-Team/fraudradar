---
id: 098
area: geral
autor: Pedro
destino: Claude Code
pai: 095
data: 2026-11-11
---

# Análise semanal ou análise completa e contínua?

> então oque fazemos atualmente não ta errado ? não faz sentido filtrar por semana, oque o sistema deveria fazer, é receber o dataset, rodar a verificação completa, e cuspir o resultado pro usuario, dizendo quais são as contas suspeitas de lavagem, e se o dataset é atualizado (supondo que fosse um banco de verdade seria 24h por dia), então ele não deveria refazer as analises, com base nas novas transações que entram ? e se conecta outro dataset ao sistema, deveria-se verificar se esse dataset se conecta com a base atual, e perguntar se é pra conectar esse novo dataset com uma extensão do atual, ou se é pra analisar ele semanalmente ?

Resposta do Claude no chat (resumo): a unidade conta × período é o padrão de PLD (lote noturno, não
tempo real) e é como o modelo foi treinado e calibrado; o que está errado é o produto: a semana como
porta de entrada, o replay como fluxo normal e a falta de processamento automático. Proposta: tela
principal "Contas suspeitas" consolidada por conta, análise completa ao receber um dataset,
monitoramento contínuo incremental que recalcula só o período aberto (períodos fechados ficam
congelados por causa das decisões e da auditoria), e na conexão duas perguntas separadas: relação
(extensão ou conjunto separado) e processamento (histórico, contínuo ou os dois). Três perguntas
ficaram para o Pedro: tela principal, frequência do contínuo e destino do replay.

Respostas do Pedro:

> 1 - sim
> 2 - Configuravel, de hora em hora como padrão
> 3 - talvez podemos fazer esse botão acionar um script ou algo assim, que cria novas transferências falsas, pra poder simular a reverificação do worker ?
>
> alem disso, faça com que o worker possa ser chamado automaticamente do front, ou ao clicar em um botão la
