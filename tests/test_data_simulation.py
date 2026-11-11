"""Simulador: quantidade, datas, contas existentes e ausência de gabarito."""

from datetime import datetime

import pandas as pd

from fraudradar.data.simulation import SIMULATION_COLUMNS, simulate_transactions


def test_simulation_resamples_after_last_date_between_existing_accounts():
    sample = pd.DataFrame(
        [
            {
                "occurred_at": datetime(2026, 11, 10, 10 + index, 30),
                "sender": index + 1,
                "receiver": index + 2,
                "amount": 100 + index * 25,
                "payment_currency": "UK pounds",
                "received_currency": "UK pounds",
                "sender_country": "UK",
                "receiver_country": "UK",
                "payment_type": "Wire",
            }
            for index in range(4)
        ]
    )
    existing = [10, 20, 30, 40, 50, 60]
    generated = simulate_transactions(
        sample,
        existing,
        transactions=50,
        days=3,
        inject_pattern=True,
        seed=7,
    )

    assert list(generated.columns) == SIMULATION_COLUMNS
    assert len(generated) == 50
    assert generated["occurred_at"].dt.date.min() > sample["occurred_at"].max().date()
    assert generated["occurred_at"].dt.date.nunique() <= 3
    assert set(generated["sender"]) | set(generated["receiver"]) <= set(existing)
    assert not {"ground_truth", "Is_laundering", "Laundering_type"} & set(generated.columns)
