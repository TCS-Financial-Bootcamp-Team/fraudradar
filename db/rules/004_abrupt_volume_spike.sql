-- Regra R-004: Mudança brusca de volume semanal frente ao histórico recente da conta
-- O que detecta: conta com histórico prévio nas 4 semanas anteriores que apresenta salto abrupto
-- no valor enviado na semana atual, sinalizando possível ruptura de perfil operacional.
-- Parâmetros: janela da semana [week, week + 7 dias) vs janela histórica [week - 28 dias, week);
-- mínimo de 2 envios e soma >= 50.000 GBP na semana (excluindo Cash Deposit); média semanal
-- prévia >= 1.000 GBP; razão week_amount / prior_weekly_avg >= 15.
-- Base normativa: Circular BCB nº 3.978/2020, art. 39, I, c (incompatibilidade com a capacidade
-- financeira do cliente; aqui, aproximada pelo histórico de movimentação da conta).

WITH week_volume AS (
    SELECT
        sender AS account,
        count(*) AS tx_count,
        sum(amount) AS week_amount
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND payment_type <> 'Cash Deposit'
    GROUP BY sender
    HAVING count(*) >= 2
       AND sum(amount) >= 50000
),
prior_history AS (
    SELECT
        t.sender AS account,
        sum(t.amount) / count(DISTINCT date_trunc('week', t.occurred_at)) AS prior_weekly_avg,
        count(DISTINCT date_trunc('week', t.occurred_at)) AS prior_active_weeks
    FROM transactions t
    JOIN week_volume w ON w.account = t.sender
    WHERE t.occurred_at >= CAST(:week AS date) - 28
      AND t.occurred_at < CAST(:week AS date)
      AND t.payment_type <> 'Cash Deposit'
    GROUP BY t.sender
    HAVING sum(t.amount) / count(DISTINCT date_trunc('week', t.occurred_at)) >= 1000
)
SELECT
    w.account,
    'Mudança brusca de volume semanal em relação ao histórico' AS rule,
    jsonb_build_object(
        'week_amount', round(w.week_amount, 2),
        'prior_weekly_avg', round(h.prior_weekly_avg, 2),
        'spike_ratio', round(w.week_amount / h.prior_weekly_avg, 2),
        'prior_active_weeks', h.prior_active_weeks,
        'week_tx_count', w.tx_count
    ) AS detail
FROM week_volume w
JOIN prior_history h ON h.account = w.account
WHERE w.week_amount >= 15 * h.prior_weekly_avg
