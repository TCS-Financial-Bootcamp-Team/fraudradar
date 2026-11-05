"""Carga do SAML-D para o treino: nomes do banco, horário montado e gabarito à parte."""

import pandas as pd

from fraudradar.data.saml_d import TRANSACTION_COLUMNS, clean_typology, load_csv
from fraudradar.data.schema import CSV_COLUMNS

# Contas inventadas: o registro e os testes não carregam números de conta do SAML-D.
ROWS = [
    "10:35:19,2022-10-07,1001,2002,1459.15,UK pounds,UK pounds,UK,UK,Cash Deposit,0,Normal_Foward",
    "10:36:00,2022-10-07,1001,3003,6019.64,UK pounds,Dirham,UK,UAE,Cross-border,1,"
    "Stacked Bipartite",
    "23:59:59,2022-10-08,3003,1001,12.5,UK pounds,UK pounds,UK,UK,ACH,1,Deposit-Send",
]


def _csv(tmp_path):
    path = tmp_path / "SAML-D.csv"
    path.write_text("\n".join([",".join(CSV_COLUMNS), *ROWS]) + "\n")
    return path


def test_load_csv_separates_ground_truth(tmp_path):
    transactions, ground_truth = load_csv(_csv(tmp_path))
    assert transactions.columns.tolist() == TRANSACTION_COLUMNS  # sem rótulo nem tipologia
    assert transactions["id"].tolist() == [0, 1, 2]
    expected = pd.to_datetime(["2022-10-07 10:35:19", "2022-10-07 10:36:00", "2022-10-08 23:59:59"])
    assert transactions["occurred_at"].tolist() == expected.tolist()
    assert transactions["sender"].tolist() == [1001, 1001, 3003]
    payment_types = transactions["payment_type"].astype(str).tolist()
    assert payment_types == ["Cash Deposit", "Cross-border", "ACH"]
    assert ground_truth["transaction_id"].tolist() == [0, 1, 2]
    assert ground_truth["label"].tolist() == [0, 1, 1]
    typologies = ground_truth["typology"].astype(str).tolist()
    assert typologies == ["normal_forward", "stacked_bipartite", "deposit_send"]


def test_load_csv_reads_only_the_first_rows(tmp_path):
    transactions, ground_truth = load_csv(_csv(tmp_path), nrows=2)
    assert len(transactions) == len(ground_truth) == 2


def test_clean_typology():
    assert clean_typology("Stacked Bipartite") == "stacked_bipartite"
    assert clean_typology("Deposit-Send") == "deposit_send"
    assert clean_typology(" Normal_Foward ") == "normal_forward"  # o erro de digitação do dado
