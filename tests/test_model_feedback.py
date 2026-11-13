"""Retorno dos analistas no retreino, sem banco: a divisão no tempo, o rótulo da conta na semana
levado às transações, a combinação com o gabarito (pesos e conflitos) e a trava de promoção."""

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from fake_saml_d import synthetic  # noqa: E402

from fraudradar.features.history import compute_features  # noqa: E402
from fraudradar.model import (  # noqa: E402
    FEEDBACK_POSITIVE_TOP,
    FEEDBACK_WEIGHT,
    MIN_FEEDBACK_LABELS,
    MIN_TEST_WEEKS,
    PROMOTION_RECALL_TOLERANCE,
)
from fraudradar.model.dataset_data import feedback_transactions  # noqa: E402
from fraudradar.model.feedback import (  # noqa: E402
    LabelCounts,
    decision_label,
    feedback_block_reason,
)
from fraudradar.model.training import (  # noqa: E402
    ActiveModel,
    Split,
    build_training_data,
    comparison_rows,
    plan_feedback,
    promotion_gate,
    resolve_feedback_split,
)


def mondays(start: str, count: int) -> list[pd.Timestamp]:
    return list(pd.date_range(start, periods=count, freq="W-MON"))


def labels_frame(rows) -> pd.DataFrame:
    """Rótulos como os de read_feedback: (alert_id, account, week, label, origin, source)."""
    frame = pd.DataFrame(rows, columns=["alert_id", "account", "week", "label", "origin", "source"])
    frame["week"] = pd.to_datetime(frame["week"])
    return frame.astype({"alert_id": "int64", "account": "int64", "label": "int8"})


# --- qual decisão deixa rótulo -----------------------------------------------------------------


def test_only_conclusive_decisions_become_labels():
    assert decision_label("report", None) == 1
    assert decision_label("archive", "false_positive") == 0
    assert decision_label("archive", "insufficient_evidence") is None
    assert decision_label("archive", None) is None  # arquivamento antigo, sem motivo
    assert decision_label("escalate", None) is None


def test_feedback_needs_enough_labels_of_both_classes():
    counts = LabelCounts()
    counts.by_source["analyst"] = [30, 15]  # 30 falsos positivos, 15 lavagens
    counts.by_source["simulated"] = [400, 100]
    reason = feedback_block_reason(counts, include_simulated=False)
    assert f"pelo menos {MIN_FEEDBACK_LABELS} rótulos" in reason and "há 45" in reason
    assert feedback_block_reason(counts, include_simulated=True) is None  # 545 com o simulado

    counts.by_source["analyst"] = [60, 0]
    assert "nenhuma lavagem confirmada" in feedback_block_reason(counts, False)
    counts.by_source["analyst"] = [0, 60]
    assert "nenhum falso positivo confirmado" in feedback_block_reason(counts, False)
    counts.by_source["analyst"] = [40, 10]
    assert feedback_block_reason(counts, False) is None  # exatamente 50


# --- divisão no tempo ---------------------------------------------------------------------------


def test_feedback_split_ends_on_the_sunday_of_the_last_feedback_week():
    truth = mondays("2023-01-02", 30)  # até 2023-07-24
    split = resolve_feedback_split(truth, [pd.Timestamp("2023-05-22"), pd.Timestamp("2023-06-12")])
    assert split == Split(train_end="2023-06-18", validation_start="2023-05-22")
    assert pd.Timestamp(split.train_end).weekday() == 6  # domingo
    assert pd.Timestamp(split.validation_start).weekday() == 0  # segunda
    assert sum(w > pd.Timestamp(split.train_end) for w in truth) == 6  # semanas de teste


def test_feedback_split_keeps_four_test_weeks_with_ground_truth():
    truth = mondays("2023-01-02", 30)  # a última é 2023-07-24
    # retorno até a penúltima semana: o corte recua para sobrarem 4 semanas de teste
    split = resolve_feedback_split(truth, [pd.Timestamp("2023-07-17")])
    after = [w for w in truth if w > pd.Timestamp(split.train_end)]
    assert len(after) == MIN_TEST_WEEKS
    assert split == Split(train_end="2023-07-02", validation_start="2023-06-05")


def test_feedback_split_refuses_too_little_ground_truth():
    with pytest.raises(ValueError, match="gabarito cobre só 8 semanas"):
        resolve_feedback_split(mondays("2023-01-02", 8), [pd.Timestamp("2023-01-09")])
    with pytest.raises(ValueError, match="não há retorno"):
        resolve_feedback_split(mondays("2023-01-02", 30), [])


def test_plan_puts_each_label_in_train_validation_or_test():
    truth = mondays("2023-01-02", 30)
    labels = labels_frame(
        [
            (1, 10, "2023-04-24", 0, "model", "analyst"),  # treino
            (2, 11, "2023-05-15", 1, "model", "analyst"),  # treino
            (3, 12, "2023-06-12", 0, "exploration", "analyst"),  # validação
            (4, 13, "2023-07-17", 1, "model", "simulated"),  # depois do corte: teste
        ]
    )
    plan = plan_feedback(labels, truth, include_simulated=True)
    assert plan.split == Split(train_end="2023-07-02", validation_start="2023-06-05")
    assert plan.labels["part"].tolist() == ["train", "train", "validation", "test"]
    info = plan.info()
    assert info["labels_used"] == {
        "total": 2,
        "by_class": {"laundering": 1, "false_positive": 1},
        "by_source": {"analyst": 2, "simulated": 0},
        "by_origin": {"model": 2, "exploration": 0},
    }
    assert (info["labels_in_validation"], info["labels_reserved_for_test"]) == (1, 1)
    assert (info["weight"], info["positive_top"]) == (FEEDBACK_WEIGHT, FEEDBACK_POSITIVE_TOP)
    # só 2 rótulos nas semanas de treino: o retreino com retorno recusa
    reason = plan.block_reason()
    assert "Sobram 2 rótulos" in reason and "2 caem na validação ou depois do corte" in reason


def test_plan_refuses_training_labels_of_a_single_class():
    truth = mondays("2023-01-02", 30)
    rows = [(i, 100 + i, "2023-04-03", 0, "model", "analyst") for i in range(MIN_FEEDBACK_LABELS)]
    rows.append((999, 999, "2023-07-03", 1, "model", "analyst"))  # a lavagem cai no teste
    plan = plan_feedback(labels_frame(rows), truth, include_simulated=False)
    assert "nenhum rótulo de lavagem confirmada" in plan.block_reason()


# --- da conta na semana às transações --------------------------------------------------------


def candidates_frame(rows) -> pd.DataFrame:
    frame = pd.DataFrame(
        rows,
        columns=[
            "alert_id",
            "transaction_id",
            "sender",
            "receiver",
            "payment_type",
            "score",
            "has_truth",
        ],
    )
    return frame.astype({"score": "float64", "has_truth": "bool"})


def test_false_positive_covers_every_transaction_of_the_account_on_its_side():
    labels = labels_frame([(1, 7, "2023-05-22", 0, "model", "analyst")])
    candidates = candidates_frame(
        [
            (1, 101, 7, 8, "ACH", 0.9, True),  # enviou
            (1, 102, 9, 7, "Cheque", 0.1, True),  # recebeu
            (1, 103, 7, 50, "Cash Withdrawal", 0.2, True),  # sacou: lado dela
            (1, 104, 7, 51, "Cash Deposit", 0.3, True),  # o CAIXA no lado de quem envia
            (1, 105, 52, 7, "Cash Withdrawal", 0.4, False),  # o CAIXA no lado de quem recebe
        ]
    )
    mapped = feedback_transactions(labels, candidates)
    assert mapped["transaction_id"].tolist() == [101, 102, 103]
    assert mapped["label"].tolist() == [0, 0, 0]


def test_confirmed_laundering_covers_only_the_top_scored_transactions():
    labels = labels_frame([(1, 7, "2023-05-22", 1, "model", "analyst")])
    scores = [0.1, 0.95, 0.3, 0.95, 0.8, 0.7, 0.2, np.nan]
    candidates = candidates_frame(
        [(1, 200 + i, 7, 300 + i, "ACH", s, True) for i, s in enumerate(scores)]
    )
    mapped = feedback_transactions(labels, candidates)
    # as 5 de maior nota: 201 e 203 (0,95), 204, 205 e 202; ficam fora as de nota 0,2 e 0,1
    # e a transação sem nota, que vai para o fim
    assert sorted(mapped["transaction_id"]) == [201, 202, 203, 204, 205]
    assert len(mapped) == FEEDBACK_POSITIVE_TOP
    assert set(mapped["label"]) == {1}


def test_transaction_with_disagreeing_labels_keeps_confirmed_laundering():
    labels = labels_frame(
        [(1, 7, "2023-05-22", 0, "model", "analyst"), (2, 8, "2023-05-22", 1, "model", "analyst")]
    )
    shared = (7, 8, "ACH", 0.9, True)
    candidates = candidates_frame([(1, 400, *shared), (2, 400, *shared)])
    mapped = feedback_transactions(labels, candidates)
    assert mapped.to_dict("records") == [{"transaction_id": 400, "label": 1, "has_truth": True}]


def test_nothing_to_map():
    empty = feedback_transactions(labels_frame([]), candidates_frame([]))
    assert empty.empty and list(empty.columns) == ["transaction_id", "label", "has_truth"]


# --- combinação com o gabarito ------------------------------------------------------------------


@pytest.fixture(scope="module")
def synthetic_data():
    transactions, ground_truth = synthetic()
    return transactions, ground_truth, compute_features(transactions)


def test_ground_truth_wins_and_only_training_rows_get_weight(synthetic_data):
    transactions, ground_truth, features = synthetic_data
    split = Split(train_end="2023-05-21", validation_start="2023-04-24")
    when = transactions.set_index("id")["occurred_at"]
    truth = ground_truth.set_index("transaction_id")["label"]
    train_ids = when[when < "2023-04-24"].index[:40].tolist()
    validation_ids = when[(when >= "2023-04-24") & (when < "2023-05-22")].index[:5].tolist()
    test_ids = when[when >= "2023-05-22"].index[:5].tolist()
    agree, disagree, no_truth = train_ids[:30], train_ids[30:39], train_ids[39]
    given = {i: int(truth[i]) for i in agree + validation_ids + test_ids}
    given.update({i: 1 - int(truth[i]) for i in disagree})
    given[no_truth] = 1
    feedback = pd.DataFrame({"transaction_id": list(given), "label": list(given.values())}).astype(
        {"transaction_id": "int64", "label": "int8"}
    )
    without = ground_truth[ground_truth["transaction_id"] != no_truth]  # sem gabarito

    data, info = build_training_data(
        transactions, without, features, split=split, feedback=feedback
    )

    position = pd.Series(np.arange(len(features)), index=features["id"].to_numpy())
    weight = pd.Series(data.weight, index=features["id"].to_numpy())
    assert (weight[agree] == FEEDBACK_WEIGHT).all()
    assert (weight[disagree] == 1.0).all()  # conflito: vale o gabarito, sem peso a mais
    assert weight[no_truth] == FEEDBACK_WEIGHT
    assert (weight[validation_ids + test_ids] == 1.0).all()  # fora do treino, nunca pesa
    assert (weight.drop(agree + [no_truth]) == 1.0).all()
    y = pd.Series(data.y, index=features["id"].to_numpy())
    assert (y[disagree] == truth[disagree]).all()
    assert y[no_truth] == 1  # sem gabarito: o rótulo do analista
    row = position[no_truth]
    assert data.train[row] and data.feedback_only[row]
    assert info.attrs["feedback"] == {
        "transactions_covered": 40,
        "transactions_weighted": 31,
        "transactions_without_truth": 1,
        "conflicts": 9,
    }
    # validação e teste só com o gabarito; o controle tira peso e linhas só do retorno
    assert not data.validation[data.feedback_only].any() and not data.test[data.feedback_only].any()
    control = data.without_feedback()
    assert control.weight is None and not control.train[row]
    assert control.train.sum() == data.train.sum() - 1
    assert (control.validation == data.validation).all() and (control.test == data.test).all()


def test_without_feedback_nothing_changes(synthetic_data):
    transactions, ground_truth, features = synthetic_data
    data, info = build_training_data(transactions, ground_truth, features)
    assert data.weight is None and data.feedback_only is None
    assert info.attrs["feedback"] is None
    assert (data.train | data.validation | data.test).all()


# --- trava de promoção ----------------------------------------------------------------------


def metrics(recall):
    return {"pr_auc": 0.5, "queue_recall": recall, "queue_precision": 0.9, "innocents_per_week": 2}


def test_gate_allows_up_to_one_point_less_recall():
    assert promotion_gate(metrics(0.95), metrics(0.95), "lightgbm_v1")["passed"] is True
    edge = 0.95 - PROMOTION_RECALL_TOLERANCE
    assert promotion_gate(metrics(edge), metrics(0.95), "lightgbm_v1")["passed"] is True
    blocked = promotion_gate(metrics(0.92), metrics(0.95), "lightgbm_v1")
    assert blocked["passed"] is False
    assert blocked["reason"].startswith("Bloqueada: acha 3,0 p.p. menos lavadoras na fila")
    assert "(lightgbm_v1)" in blocked["reason"] and "92,0% contra 95,0%" in blocked["reason"]
    unknown = promotion_gate(metrics(None), metrics(0.95), "lightgbm_v1")
    assert unknown["passed"] is False and "Não há lavagem" in unknown["reason"]


class _Data:
    def __init__(self, test):
        self.test = np.array(test)


def test_comparison_skips_the_weeks_the_active_model_saw_in_the_same_dataset():
    weeks = pd.to_datetime(["2023-05-15", "2023-05-22", "2023-05-29", "2023-06-05"])
    truth = pd.DataFrame({"week": weeks})
    data = _Data([False, True, True, True])  # teste da versão nova: de 22/05 em diante
    card = {"train_end": "2023-05-28", "training_dataset": "saml-d"}
    active = ActiveModel(booster=None, card=card, name="saml-d/v2")
    # a ativa treinou neste conjunto até 28/05: só as semanas depois disso valem
    assert comparison_rows(truth, data, active, "saml-d").tolist() == [2, 3]
    # em outro conjunto ela nunca viu as transações: vale todo o teste da versão nova
    assert comparison_rows(truth, data, active, "banco-teste").tolist() == [1, 2, 3]
    # ficha sem training_dataset é a do oficial (SAML-D)
    active.card = {"train_end": "2023-05-28"}
    assert comparison_rows(truth, data, active, "saml-d").tolist() == [2, 3]
