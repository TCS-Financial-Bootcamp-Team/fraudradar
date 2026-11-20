# Regras de cenário (SQL)

Regras determinísticas de PLD que rodam ao lado do modelo e entram em
`evidence.rules`. Escritas pela frente 1 e calibradas no SAML-D.

Convenção: um arquivo por regra, `NNN_rule_name.sql`, com um comentário no
topo dizendo o que a regra detecta, o parâmetro (limite, janela) e a base
normativa (Circular BCB 3.978/2020 quando houver). Cada regra recebe a semana
(`:week`, uma segunda-feira) e devolve `account, rule, detail JSONB`.

| Código | Arquivo | O que detecta |
|---|---|---|
| R-001 | `001_cash_structuring.sql` | fracionamento em espécie abaixo do limite |
| R-002 | `002_high_counterparty_fan_activity.sql` | muitas contrapartes enviando ou recebendo (fan-in/fan-out) |
| R-003 | `003_high_risk_jurisdiction.sql` | transação internacional de valor elevado com jurisdição de maior risco |
| R-004 | `004_abrupt_volume_spike.sql` | salto brusco de volume em relação ao histórico da conta |
| R-005 | `005_cash_heavy_activity.sql` | atividade concentrada em espécie |

Testes em `tests/worker/test_worker_rules.py`.

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
