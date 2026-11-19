-- Regra R-002: Dispersão ou concentração elevada de contrapartes na semana (fan-out / fan-in)
-- O que detecta: conta que envia recursos para muitas contrapartes distintas (fan-out) ou recebe
-- de muitas contrapartes distintas (fan-in) em uma única semana, excluindo o lado sintético
-- das operações em espécie.
-- Parâmetros: janela semanal [week, week + 7 dias); mínimo de 15 contrapartes distintas em
-- envio ou em recebimento na semana.
-- Base normativa: Circular BCB nº 3.978/2020, art. 39, I (operações que, pelas partes envolvidas,
-- valores ou formas de realização, podem indicar lavagem) e Carta Circular BCB nº 4.001/2020 (pulverização ou concentração atípica).

WITH out_degree AS (
    SELECT
        sender AS account,
        count(DISTINCT receiver) AS counterparties,
        sum(amount) AS total_amount
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND payment_type <> 'Cash Deposit'
      AND receiver <> sender
    GROUP BY sender
    HAVING count(DISTINCT receiver) >= 15
),
in_degree AS (
    SELECT
        receiver AS account,
        count(DISTINCT sender) AS counterparties,
        sum(amount) AS total_amount
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND payment_type <> 'Cash Withdrawal'
      AND sender <> receiver
    GROUP BY receiver
    HAVING count(DISTINCT sender) >= 15
),
combined AS (
    SELECT account, counterparties AS out_counterparties, CAST(0 AS bigint) AS in_counterparties, total_amount
    FROM out_degree
    UNION ALL
    SELECT account, CAST(0 AS bigint) AS out_counterparties, counterparties AS in_counterparties, total_amount
    FROM in_degree
)
SELECT
    account,
    'Fan-out ou fan-in elevado de contrapartes na semana' AS rule,
    jsonb_build_object(
        'distinct_receivers', max(out_counterparties),
        'distinct_senders', max(in_counterparties),
        'threshold_counterparties', 15,
        'total_amount', round(sum(total_amount), 2)
    ) AS detail
FROM combined
GROUP BY account
