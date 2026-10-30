# Regras de cenário (SQL)

Regras determinísticas de PLD que rodam ao lado do modelo e entram em
`evidence.rules`. Preenchido pela frente 1 na semana 1.

Convenção: um arquivo por regra, `NNN_rule_name.sql`, com um comentário no
topo dizendo o que a regra detecta, o parâmetro (limite, janela) e a base
normativa (Circular BCB 3.978/2020 quando houver). Cada regra recebe a semana
(`:week`, uma segunda-feira) e devolve `account, rule, detail JSONB`.

Exemplos a escrever: fracionamento abaixo do limite, muitos depósitos em
espécie, fan-in/fan-out alto, envio para país de alto risco, mudança brusca de
volume em relação ao histórico da conta.
