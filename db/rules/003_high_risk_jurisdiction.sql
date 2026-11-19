-- Regra R-003: Movimentação transfronteiriça relevante com jurisdições de maior risco
-- O que detecta: transações internacionais de valor elevado na semana envolvendo jurisdições
-- com maior incidência de risco de PLD no SAML-D (Nigeria, Albania, Turkey, Pakistan, UAE, Morocco).
-- Parâmetros: janela semanal [week, week + 7 dias); sender_country <> receiver_country;
-- pelo menos um dos países na lista de risco; amount >= 20.000 GBP. Exclui o lado sintético de espécie.
-- Base normativa: Circular BCB nº 3.978/2020, art. 39, I, g (operações oriundas ou destinadas a
-- países com deficiências estratégicas segundo o Gafi). A lista de países acima vem do SAML-D,
-- não da lista oficial do Gafi: no dataset não há uma lista de jurisdições sancionadas.

WITH flagged_tx AS (
    SELECT
        sender,
        receiver,
        payment_type,
        amount,
        sender_country,
        receiver_country
    FROM transactions
    WHERE occurred_at >= CAST(:week AS date)
      AND occurred_at < CAST(:week AS date) + 7
      AND sender_country <> receiver_country
      AND amount >= 20000
      AND (
          sender_country IN ('Nigeria', 'Albania', 'Turkey', 'Pakistan', 'UAE', 'Morocco')
          OR receiver_country IN ('Nigeria', 'Albania', 'Turkey', 'Pakistan', 'UAE', 'Morocco')
      )
),
sides AS (
    SELECT
        sender AS account,
        amount,
        CASE
            WHEN sender_country IN ('Nigeria', 'Albania', 'Turkey', 'Pakistan', 'UAE', 'Morocco')
                THEN sender_country
            ELSE receiver_country
        END AS risk_country
    FROM flagged_tx
    WHERE payment_type <> 'Cash Deposit'
    UNION ALL
    SELECT
        receiver AS account,
        amount,
        CASE
            WHEN receiver_country IN ('Nigeria', 'Albania', 'Turkey', 'Pakistan', 'UAE', 'Morocco')
                THEN receiver_country
            ELSE sender_country
        END AS risk_country
    FROM flagged_tx
    WHERE payment_type <> 'Cash Withdrawal'
      AND receiver <> sender
)
SELECT
    account,
    'Operação internacional relevante com jurisdição de alto risco' AS rule,
    jsonb_build_object(
        'transaction_count', count(*),
        'total_amount', round(sum(amount), 2),
        'max_amount', round(max(amount), 2),
        'countries', jsonb_agg(DISTINCT risk_country ORDER BY risk_country)
    ) AS detail
FROM sides
GROUP BY account
