"""Modelo: a régua, a fila, os atalhos, o treino, a gravação, a explicação e os segmentos.

Usam o dado sintético e precisam do grupo `ml` (LightGBM e scikit-learn); sem ele, são pulados.
"""

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")
pytest.importorskip("sklearn")

from fake_saml_d import synthetic  # noqa: E402

from fraudradar.features.history import CASH_ACCOUNT, compute_features  # noqa: E402
from fraudradar.model.check import check_model  # noqa: E402
from fraudradar.model.evaluation import (  # noqa: E402
    account_weeks,
    best_f1_threshold,
    evaluate,
    false_positive_by_group,
    find_shortcuts,
    recall_at_fpr,
    weekly_queue,
)
from fraudradar.model.segments import assign_segments, fit_segments  # noqa: E402
from fraudradar.model.training import (  # noqa: E402
    build_training_data,
    explain,
    load_model,
    save_model,
    train_lightgbm,
)


def _synthetic_data():
    transactions, ground_truth = synthetic()
    return build_training_data(transactions, ground_truth, compute_features(transactions))


def test_recall_at_fpr():
    y = np.array([0] * 1000 + [1] * 10)
    assert recall_at_fpr(y, y.astype(float))[0] == 1
    assert recall_at_fpr(y, -y.astype(float))[0] == 0


def test_best_f1_threshold():
    y = np.array([0, 0, 0, 1, 1])
    score = np.array([0.1, 0.2, 0.6, 0.5, 0.9])
    # corte 0,9: precisão 1 e recall 0,5 (F1 0,67); 0,6: F1 0,5; 0,5: precisão 0,67 e recall 1
    assert best_f1_threshold(y, score) == 0.5


def test_weekly_queue():
    """Fila de 2 contas por semana. Quem envia e quem recebe herdam o score da transação."""
    week = np.array([1, 1, 1, 2, 2])
    sender = np.array(["a", "b", "a", "c", "b"])
    receiver = np.array(["x", "y", "x", "x", "y"])
    score = np.array([0.9, 0.5, 0.1, 0.2, 0.8])
    y = np.array([1, 0, 0, 1, 0])
    accounts = account_weeks(week, sender, receiver, score, y)
    # positivas: a e x na semana 1; c e x na semana 2. Fila: {a, x} na semana 1 e {b, y} na 2
    assert weekly_queue(accounts, size=2) == (0.5, 0.5, 2.0)
    # com corte de 0,85 só a e x entram (semana 1): a fila encolhe e para de ter inocentes
    assert weekly_queue(accounts, size=2, cut=0.85) == (0.5, 1.0, 1.0)


def test_cash_account_never_enters_the_queue():
    one = np.array([1])
    accounts = account_weeks(one, np.array([10]), np.array([CASH_ACCOUNT]), np.array([0.9]), one)
    assert accounts.index.get_level_values("account").tolist() == [10]


def test_find_shortcuts_finds_a_rule_that_only_catches_laundering():
    n = 1000
    x = pd.DataFrame(
        {"payment_type": pd.Categorical(["ACH"] * n), "amount": np.arange(n, dtype=float)}
    )
    y = (x["amount"] >= 970).to_numpy().astype("int8")  # os 30 maiores valores: só lavagem
    rules, mask = find_shortcuts(x, y, train=np.ones(n, dtype=bool))
    assert "amount > 969" in rules["rule"].tolist()
    assert mask.sum() == 30


def test_lightgbm_never_sees_the_test():
    data, truth = _synthetic_data()
    assert (data.y[data.test] == -1).all() and data.train.any() and data.validation.any()
    score = train_lightgbm(data).predict_proba(data.x)[:, 1]
    assert score.shape == (len(data.x),) and np.isfinite(score).all()
    metrics, _ = evaluate(score, data, truth)
    assert 0 <= metrics["pr_auc"] <= 1


def test_saved_model_reproduces_the_metrics(tmp_path):
    """O modelo gravado, lido de volta, dá as mesmas métricas da ficha. Cada gravação é uma
    versão nova, e a cópia em MODEL_FILE é a da versão mais nova."""
    transactions, ground_truth = synthetic()
    card = save_model(transactions, ground_truth, folder=tmp_path)
    booster, read = load_model(tmp_path)
    assert read["version"] == card["version"] == 1 and read["queue_cut"] == card["queue_cut"]
    assert read["week_start"] == "monday" and (tmp_path / "lightgbm_model.txt").is_file()
    data, truth = build_training_data(transactions, ground_truth, compute_features(transactions))
    metrics, _ = evaluate(booster.predict(data.x[read["features"]]), data, truth)
    assert metrics["pr_auc"] == pytest.approx(read["metrics"]["pr_auc"])
    assert save_model(transactions, ground_truth, folder=tmp_path)["version"] == 2


def test_explanation_sums_to_the_raw_score(tmp_path):
    """As contribuições de todas as variáveis, mais a base, dão o score bruto; a explicação
    vem da maior para a menor."""
    transactions, ground_truth = synthetic()
    save_model(transactions, ground_truth, folder=tmp_path)
    booster, card = load_model(tmp_path)
    data, _ = build_training_data(transactions, ground_truth, compute_features(transactions))
    x = data.x[card["features"]]
    contributions = booster.predict(x, pred_contrib=True)
    raw = booster.predict(x, raw_score=True)
    np.testing.assert_allclose(contributions.sum(axis=1), raw, rtol=1e-5, atol=1e-6)
    for reasons in explain(booster, x.head(20), top=3):
        c = [r["contribution"] for r in reasons]
        assert len(c) == 3 and c[0] >= c[1] >= c[2]


def test_segment_is_the_nearest_center():
    profiles = pd.DataFrame({"a": [0, 0, 1, 100, 101, 99.0], "b": [5, 6, 5, 0, 1, 0.0]})
    s = assign_segments(profiles, fit_segments(profiles, ks=[2])).tolist()
    assert s[0] == s[1] == s[2] != s[3] == s[4] == s[5]


def test_check_of_the_saved_model(tmp_path):
    transactions, ground_truth = synthetic()
    save_model(transactions, ground_truth, folder=tmp_path)
    alerts, segments, bias = check_model(
        transactions, ground_truth, folder=tmp_path, launderers=3, innocents=1
    )
    assert 0 < len(alerts) <= 4 and (alerts["reasons"].str.len() > 0).all()
    assert segments["account_weeks"].sum() > 0 and segments["alert_rate"].between(0, 1).all()
    assert set(bias["group"]) == {"payment_type", "receiver_country", "sender_country"}


def test_false_positive_by_group_uses_one_threshold():
    data, truth = _synthetic_data()
    score = np.where(truth["y"] == 1, 0.9, 0.1)  # o gabarito como score: nenhum falso positivo
    bias = false_positive_by_group(score, data, truth)
    assert (bias["fpr"] == 0).all() and bias["recall"].between(0, 1).all()
