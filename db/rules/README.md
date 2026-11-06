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

## Como o worker roda as regras

A cada semana processada (`python -m worker batch`, `backfill` ou `replay`), o worker roda
todos os `NNN_rule_name.sql` desta pasta, em ordem, na transação do lote, e põe as linhas de
cada conta da fila em `evidence.rules`: `{"code": "R-NNN", "description": rule, "detail":
detail}`. O código vem do número do arquivo (`001_cash_structuring.sql` vira `R-001`); a tela
do alerta mostra o código e a descrição.

- A semana chega como o parâmetro `:week` (uma data). Use `CAST(:week AS date)`; não escreva
  `:week::date`, porque o SQLAlchemy não reconhece o parâmetro colado em `::`.
- A consulta precisa devolver as colunas `account`, `rule` e `detail` (JSONB, pode ser nulo).
- Arquivo `.sql` fora do padrão de nome ou regra que falha param o lote da semana, que não
  grava nada: o erro diz qual arquivo. Teste com `python -m worker batch --week AAAA-MM-DD
  --force` numa semana ainda não liberada.
