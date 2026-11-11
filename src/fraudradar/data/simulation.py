"""Geração de transações sintéticas para a demonstração contínua.

O simulador reaproveita somente a distribuição transacional do próprio conjunto. Ele não
consulta nem produz gabarito e sempre escolhe contas que já existem no conjunto.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

SIMULATION_COLUMNS = [
    "occurred_at",
    "sender",
    "receiver",
    "amount",
    "payment_currency",
    "received_currency",
    "sender_country",
    "receiver_country",
    "payment_type",
]


class SimulationError(ValueError):
    """O conjunto não tem dados suficientes para uma simulação coerente."""


def simulate_transactions(
    sample: pd.DataFrame,
    accounts: Sequence[int],
    *,
    transactions: int,
    days: int,
    inject_pattern: bool,
    seed: int | None = None,
    last_occurred_at: datetime | pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Reamostra atributos e cria transações após a última data observada.

    ``transactions`` é a quantidade total, inclusive as linhas do padrão opcional. O fan-out
    usa contrapartes já existentes, mas novas para a conta central dentro da simulação.
    """
    if transactions <= 0:
        raise SimulationError("A quantidade de transações deve ser positiva.")
    if not 1 <= days <= 7:
        raise SimulationError("A simulação deve cobrir de 1 a 7 dias.")
    missing = [column for column in SIMULATION_COLUMNS if column not in sample.columns]
    if missing:
        raise SimulationError(f"A amostra não contém as colunas necessárias: {', '.join(missing)}.")
    if sample.empty:
        raise SimulationError("O conjunto não tem transações para reamostrar.")
    account_values = np.array(sorted({int(account) for account in accounts}), dtype="int64")
    if len(account_values) < 2:
        raise SimulationError("O conjunto precisa ter ao menos duas contas para simular.")

    rng = np.random.default_rng(seed)
    chosen = rng.integers(0, len(sample), size=transactions)
    result = sample.iloc[chosen][SIMULATION_COLUMNS].copy().reset_index(drop=True)

    last_at = (
        pd.Timestamp(last_occurred_at)
        if last_occurred_at is not None
        else pd.to_datetime(sample["occurred_at"], format="mixed").max()
    )
    first_day = last_at.normalize() + timedelta(days=1)
    source_times = pd.to_datetime(result["occurred_at"], format="mixed")
    seconds = (
        source_times.dt.hour * 3600 + source_times.dt.minute * 60 + source_times.dt.second
    ).to_numpy()
    offsets = rng.integers(0, days, size=transactions)
    result["occurred_at"] = (
        first_day + pd.to_timedelta(offsets, unit="D") + pd.to_timedelta(seconds, unit="s")
    )

    result["sender"] = rng.choice(account_values, size=transactions)
    result["receiver"] = rng.choice(account_values, size=transactions)
    same = result["sender"].to_numpy() == result["receiver"].to_numpy()
    while same.any():
        result.loc[same, "receiver"] = rng.choice(account_values, size=int(same.sum()))
        same = result["sender"].to_numpy() == result["receiver"].to_numpy()

    if inject_pattern and transactions >= 3:
        central = int(rng.choice(account_values))
        counterparties = account_values[account_values != central]
        fan_rows = min(transactions, len(counterparties) + 2, max(8, transactions // 10))
        targets = rng.choice(
            counterparties,
            size=min(len(counterparties), max(1, fan_rows - 2)),
            replace=False,
        )
        incoming = min(2, fan_rows - len(targets))
        for index in range(incoming):
            result.loc[index, ["sender", "receiver"]] = [
                int(counterparties[index % len(counterparties)]),
                central,
            ]
        for offset, target in enumerate(targets, start=incoming):
            result.loc[offset, ["sender", "receiver"]] = [central, int(target)]
        pattern_rows = incoming + len(targets)
        result.loc[: pattern_rows - 1, "occurred_at"] = [
            first_day + timedelta(minutes=10 * index) for index in range(pattern_rows)
        ]

    return (
        result[SIMULATION_COLUMNS].sort_values("occurred_at", kind="stable").reset_index(drop=True)
    )
