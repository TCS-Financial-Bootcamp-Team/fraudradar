"""Retreino fora das datas do SAML-D: divisão proporcional no tempo e numeração das versões."""

import json

import pandas as pd
from fake_saml_d import synthetic

from fraudradar.model.training import resolve_split, train_version


def test_trains_on_another_period_with_a_proportional_time_split(tmp_path):
    transactions, ground_truth = synthetic()
    transactions["occurred_at"] += pd.Timedelta(days=730)  # 2025: fora das datas do SAML-D
    split = resolve_split(transactions)

    card = train_version(
        transactions, ground_truth, tmp_path, first_version=3, dataset="externo-2025"
    )

    assert card["training_dataset"] == "externo-2025"  # só nele o worker trava o treino
    assert (card["train_end"], card["validation_start"]) == (
        split.train_end,
        split.validation_start,
    )
    assert pd.Timestamp(card["train_end"]).year == 2025
    assert card["version"] == 3  # depois do oficial
    assert (tmp_path / "lightgbm_v3.txt").is_file()
    assert not (tmp_path / "lightgbm_model.txt").exists()
    saved = json.loads((tmp_path / "lightgbm_v3.json").read_text(encoding="utf-8"))
    assert saved["metrics"]["pr_auc"] > 0
    # Teste sempre depois do treino: o corte é no tempo, nunca aleatório.
    assert pd.Timestamp(split.train_end) < transactions["occurred_at"].max()
