-- Regra R-005: Atividade fortemente concentrada em espécie na semana
-- O que detecta: conta cuja movimentação semanal ocorre predominantemente por meio de depósitos
-- ou saques em espécie, com recorrência e volume relevantes.
-- Parâmetros: janela semanal [week, week + 7 dias); mínimo de 3 transações da conta na semana
-- (excluindo o lado sintético de espécie); fração de operações em espécie >= 0,75 (75%);
-- valor total em espécie >= 4.000 GBP na semana.
-- Base normativa: Circular BCB nº 3.978/2020, art. 39, I, b (depósito ou saque em espécie com
-- indício de ocultação da origem ou da movimentação dos valores).

WITH sides AS (
    SELECT
        sender AS account,
        amount,
        (payment_type = 'Cash Withdrawal') AS is_cash
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND payment_type <> 'Cash Deposit'
    UNION ALL
    SELECT
        receiver AS account,
        amount,
        (payment_type = 'Cash Deposit') AS is_cash
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND payment_type <> 'Cash Withdrawal'
)
SELECT
    account,
    'Atividade concentrada em operações em espécie na semana' AS rule,
    jsonb_build_object(
        'total_transactions', count(*),
        'cash_transactions', count(*) FILTER (WHERE is_cash),
        'cash_share', round(CAST(count(*) FILTER (WHERE is_cash) AS numeric) / count(*), 4),
        'cash_amount', round(coalesce(sum(amount) FILTER (WHERE is_cash), 0), 2)
    ) AS detail
FROM sides
GROUP BY account
HAVING count(*) >= 3
   AND CAST(count(*) FILTER (WHERE is_cash) AS numeric) / count(*) >= 0.75
   AND coalesce(sum(amount) FILTER (WHERE is_cash), 0) >= 4000
