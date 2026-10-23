# Regras de cenário (SQL)

Regras determinísticas de PLD que rodam ao lado do modelo e entram em
`evidencias.regras`. Preenchido pela frente 1 na semana 1.

Convenção: um arquivo por regra, `NNN_nome_da_regra.sql`, com um comentário no
topo dizendo o que a regra detecta, o parâmetro (limite, janela) e a base
normativa (Circular BCB 3.978/2020 quando houver). Cada regra recebe a semana
(`:semana`, uma segunda-feira) e devolve `conta, regra, detalhe JSONB`.

Exemplos a escrever: fracionamento abaixo do limite, muitos depósitos em
espécie, fan-in/fan-out alto, envio para país de alto risco, mudança brusca de
volume em relação ao histórico da conta.
