-- Regra R-001: Fracionamento de depósitos em espécie (structuring / smurfing)
-- O que detecta: múltiplas operações de depósito em espécie em uma mesma conta dentro da semana,
-- com valores individuais abaixo do limiar de alerta operacional, acumulando montante relevante.
-- Parâmetros: janela semanal [week, week + 7 dias); payment_type = 'Cash Deposit';
-- 1.000 <= amount < 6.000 GBP por depósito; mínimo de 3 depósitos e soma >= 5.000 GBP na semana.
-- Base normativa: Circular BCB nº 3.978/2020, art. 39, I, a (operações que, pela habitualidade,
-- valor ou forma, burlam os procedimentos de registro e monitoramento) e b (depósito em espécie
-- com indício de ocultação); Lei nº 9.613/1998, art. 11.

SELECT
    receiver AS account,
    'Múltiplos depósitos em espécie abaixo do limite na semana' AS rule,
    jsonb_build_object(
        'deposit_count', count(*),
        'total_amount', round(sum(amount), 2),
        'max_deposit', round(max(amount), 2),
        'threshold_amount', 6000
    ) AS detail
FROM transactions
WHERE occurred_at >= CAST(:week AS date)
  AND occurred_at < CAST(:week AS date) + 7
  AND payment_type = 'Cash Deposit'
  AND amount >= 1000
  AND amount < 6000
GROUP BY receiver
HAVING count(*) >= 3
   AND sum(amount) >= 5000
