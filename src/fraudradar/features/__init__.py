"""Engenharia de features: única fonte de variáveis do projeto.

`history.py` calcula as variáveis de cada transação com o histórico das contas (só o passado),
aplica o CAIXA, define a semana (segunda-feira) e monta o perfil das contas para os segmentos.
Ainda podem vir aqui: sinais semanais por conta e features de grafo.

Este arquivo fica leve (sem pandas): a API importa `feature_label` para o detalhe do alerta.
"""

# Nome legível de cada feature, exibido no detalhe do alerta (contribuições).
# Sem entrada, a API mostra o nome técnico.
FEATURE_LABELS: dict[str, str] = {
    "amount": "Valor da transação",
    "hour": "Hora da transação",
    "payment_type": "Meio de pagamento",
    "sender_country": "País de quem envia",
    "receiver_country": "País de quem recebe",
    "cross_border": "Transação entre países",
    "currency_mismatch": "Moedas diferentes",
    "sender_sent_count": "Envios anteriores de quem envia",
    "sender_mean_amount": "Valor médio que quem envia já enviou",
    "sender_amount_ratio": "Valor frente à média de quem envia",
    "sender_days_since_last": "Dias desde o último envio",
    "sender_sent_count_7d": "Envios de quem envia em 7 dias",
    "sender_sent_amount_7d": "Valor enviado por quem envia em 7 dias",
    "sender_distinct_receivers": "Contas que quem envia já pagou",
    "new_counterparty": "Primeira transação entre as duas contas",
    "sender_new_counterparty_share_7d": "Fração de contrapartes novas em 7 dias",
    "sender_received_amount_7d": "Valor recebido por quem envia em 7 dias",
    "sender_received_count_7d": "Recebimentos de quem envia em 7 dias",
    "sender_out_in_ratio_7d": "Repasse do que quem envia recebeu em 7 dias",
    "receiver_received_count": "Recebimentos anteriores de quem recebe",
    "receiver_distinct_senders": "Origens anteriores de quem recebe",
    "receiver_new_senders_7d": "Origens novas de quem recebe em 7 dias",
    "receiver_days_since_last": "Dias desde o último recebimento",
    "receiver_received_count_7d": "Recebimentos de quem recebe em 7 dias",
    "receiver_received_amount_7d": "Valor recebido por quem recebe em 7 dias",
    "receiver_sent_amount_7d": "Valor enviado por quem recebe em 7 dias",
}


def feature_label(name: str) -> str:
    return FEATURE_LABELS.get(name, name)
