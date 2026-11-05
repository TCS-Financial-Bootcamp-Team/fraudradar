"""Carga do SAML-D para o treino: transações com os nomes do banco e o gabarito à parte.

O worker vai ler as transações do Postgres; o treino lê o CSV inteiro (~1 GB, uns 10 s). Para
só olhar o dado, use `nrows`: a regra do time é nunca ler o CSV inteiro para inspecionar.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from fraudradar.data.schema import COLUMN_RENAMES, CSV_DTYPES

# As colunas de `transactions` (db/init/002_tables.sql), na mesma ordem, com `id` na frente.
TRANSACTION_COLUMNS: list[str] = [
    "id",
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


def clean_typology(name: str) -> str:
    """'Stacked Bipartite' -> 'stacked_bipartite'. Também corrige o 'Foward' do dado original."""
    return name.strip().lower().replace(" ", "_").replace("-", "_").replace("foward", "forward")


def load_csv(path: Path | str, nrows: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Lê o SAML-D e separa as transações (o que o banco vê) do gabarito (o que só a avaliação vê).

    As transações têm as colunas de `transactions`, com os valores como vieram no CSV
    (ex.: `payment_type` = "Cash Deposit"). O gabarito tem as de `ground_truth`: `transaction_id`,
    `label` (0 ou 1), `original_typology` e `typology` (o nome limpo). `id` é a posição da linha
    no arquivo, a partir de 0.
    """
    raw = pd.read_csv(path, dtype=CSV_DTYPES, nrows=nrows).rename(columns=COLUMN_RENAMES)
    ids = np.arange(len(raw), dtype="int32")
    occurred_at = pd.to_datetime(raw["Date"] + " " + raw["Time"], format="%Y-%m-%d %H:%M:%S")
    transactions = pd.DataFrame(
        {"id": ids, "occurred_at": occurred_at, **{c: raw[c] for c in TRANSACTION_COLUMNS[2:]}}
    )
    ground_truth = pd.DataFrame(
        {
            "transaction_id": ids,
            "label": raw["label"].astype("int8"),
            "original_typology": raw["original_typology"],
            "typology": raw["original_typology"].cat.rename_categories(clean_typology),
        }
    )
    return transactions, ground_truth
