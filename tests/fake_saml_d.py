"""Dado pequeno no formato do SAML-D (não é o SAML-D), para testar o modelo em segundos.

As colunas são as do banco (`transactions` e `ground_truth`). Cobre as datas de treino,
validação e teste do modelo. As contas 0 a 3 lavam dinheiro nas transações acima da mediana.
"""

import numpy as np
import pandas as pd

PAYMENT_TYPES = [
    "Credit card",
    "Debit card",
    "Cheque",
    "ACH",
    "Cross-border",
    "Cash Withdrawal",
    "Cash Deposit",
]


def synthetic(
    n: int = 4000, accounts: int = 80, seed: int = 0
) -> tuple[pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(seed)
    seconds = np.sort(rng.integers(0, 150 * 86_400, n)) // 3600 * 3600  # horas cheias: há empates
    transactions = pd.DataFrame(
        {
            "id": np.arange(n, dtype="int32"),
            "occurred_at": pd.Timestamp("2023-03-03") + pd.to_timedelta(seconds, unit="s"),
            "sender": rng.integers(0, accounts, n),
            "receiver": rng.integers(0, accounts, n),
            "amount": rng.lognormal(8, 1, n).round(2),
            "payment_currency": "UK pounds",
            "received_currency": rng.choice(["UK pounds", "Euro"], n, p=[0.9, 0.1]),
            "sender_country": "UK",
            "receiver_country": rng.choice(["UK", "Spain"], n, p=[0.9, 0.1]),
            "payment_type": rng.choice(PAYMENT_TYPES, n),
        }
    )
    amount = transactions["amount"]
    laundering = (transactions["sender"] < 4) & (amount > amount.median())
    ground_truth = pd.DataFrame(
        {
            "transaction_id": transactions["id"],
            "label": laundering.astype("int8"),
            "original_typology": np.where(laundering, "Fan_Out", "Normal_Fan_Out"),
            "typology": np.where(laundering, "fan_out", "normal_fan_out"),
        }
    )
    return transactions, ground_truth
