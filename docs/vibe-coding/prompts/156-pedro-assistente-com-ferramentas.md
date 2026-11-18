---
id: 156
area: ia
autor: Pedro
destino: Claude Code (conta 2)
data: 2026-11-18
---

# Pedido do Pedro: assistente com ferramentas, troca de modelo, histórico e contexto da página

> para o assistente de IA, vamos adcionar mais algumas funcionalidades
>
> 1 - tem vez que o modelo da como indisponivel, então adcione um botão que permita mudar o
> modelo gemini ativo
>
> 2 - O agente tambem tem que conhecer todo o sistema, todas as telas e oque cada uma faz, oque
> cada botão faz, ele deve tambem ter o poder de gerar no site elementos html que redrecionam o
> usuario para uma pagina especifica dentro do sistema por exemplo, pro caso do usuario nao
> encontrar a pagina ou algo assim
>
> 3 - deve ter botão pra reiniciar a conversa, tambem deve ter o historico de conversa com o
> agente, podendo voltar pra uma conversa antiga
>
> 4 - a ia tambem deve ter o contexto da pagina atual, sabendo oque tem na pagina que o usuario
> tem atualmente aberto, por exemplo, se tiver em /alerts, a ia conseguiria ter o contexto ali de
> todos os alertas VISIVEIS na tela, com tools pra pesquisar entre a base de dados de tarefas pro
> caso do usuario pedir algo especifico
>
> ou seja, teremos que dar varias tools pra ela, poem o agy ou codex pra escrever codigo, vc
> revisa, me de sua opinião sobre as solicitações, e concentre os botões novos na região do input
> de escrever, semelhante ao input do cursor

(Anexo: captura do campo de texto do Cursor, com o seletor de modo e de modelo na linha de baixo,
dentro da mesma caixa.)

Decisões técnicas da IA (reversíveis): os links de navegação são dados estruturados, validados
contra uma lista fechada de rotas no servidor e no navegador, e nunca HTML gerado pelo modelo; o
navegador manda só os ids dos alertas visíveis e o servidor relê o resto do banco; o histórico fica
no banco, por usuário e conjunto de dados; ao dar 503 ou 429, o modelo escolhido cai uma vez para o
próximo da lista. Contrato comum em 157 e 158.

Esclarecimento do Pedro, na mesma conversa:

> sobre o 2, nao seria gerar html na tela, seria APENAS dentro do chat, e via tool, a ia nao
> geraria o html em si, ela chamaria a tool seguindo parametros

Coincide com o desenho delegado: a tool `suggest_link` recebe um destino de uma lista fechada, e o
chat desenha o botão.
