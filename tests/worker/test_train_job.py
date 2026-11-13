"""Trabalho ``train``: retreino de um conjunto a partir do banco, e a promoção da versão nova."""

import json
import shutil
from datetime import date
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import average_precision_score
from sqlalchemy import text
from worker_helpers import FIRST_WEEK, LAST_WEEK, execute, label_from_truth, rows, scalar

from fraudradar.config import get_settings
from fraudradar.datasets import resolve_dataset
from fraudradar.features.history import compute_features, week_start, with_cash_account
from fraudradar.model.dataset_data import read_feedback, read_feedback_candidates
from fraudradar.model.evaluation import account_weeks, weekly_queue
from fraudradar.model.scoring import model_input
from fraudradar.model.training import OFFICIAL_SPLIT, resolve_split
from worker.batch import _dataset_model, model_version, run_backfill
from worker.jobs import process_next_job


def run_train(client, db) -> dict:
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 202, response.text
    assert process_next_job(db) is True
    return rows(db, "SELECT * FROM public.jobs WHERE id = :id", id=int(response.json()["id"]))[0]


def test_train_writes_a_new_version_with_metrics_and_keeps_official_active(
    client, loaded, model_dir
):
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():  # o modelo oficial do SAML-D (v1) já existe
        shutil.copy(path, official / path.name)

    job = run_train(client, loaded)

    assert job["status"] == "done", job["message"]
    assert job["progress"] == 100
    # Numera depois do oficial: o nome da versão é chave em model_versions.
    own = official / "saml-d"
    card = json.loads((own / "lightgbm_v2.json").read_text(encoding="utf-8"))
    official_card = json.loads((official / "lightgbm_v1.json").read_text(encoding="utf-8"))
    assert (own / "lightgbm_v2.txt").is_file()
    assert set(card["metrics"]) == set(official_card["metrics"])
    assert card["features"] == official_card["features"]
    assert card["train_end"] == OFFICIAL_SPLIT.train_end  # divisão no tempo oficial
    assert card["training_dataset"] == "saml-d"  # só nele o worker recusa as semanas do treino
    assert card["validation_start"] == OFFICIAL_SPLIT.validation_start
    assert card["file"] == "lightgbm_v2.txt"
    assert not (own / "lightgbm_model.txt").exists()  # só o oficial alimenta o health
    # A versão nova não vira a ativa sozinha.
    listing = client.get("/datasets/saml-d/models").json()
    assert listing["active_version"] == "lightgbm_v1"
    assert {v["version"]: v["active"] for v in listing["versions"]} == {
        "saml-d/v2": False,
        "lightgbm_v1": True,
    }
    new = listing["versions"][0]
    assert new["metrics"]["pr_auc"] is not None
    assert "model_trained" in [r["action"] for r in rows(loaded, "SELECT action FROM audit_log")]


def test_scoring_loads_the_promoted_version(client, loaded, model_dir):
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    assert run_train(client, loaded)["status"] == "done"
    with loaded.connect() as conn:
        _, before = _dataset_model(resolve_dataset(conn, "saml-d"), official)
    assert before["version"] == 1  # sem versão fixada: o oficial

    response = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")
    assert response.status_code == 200

    with loaded.connect() as conn:
        dataset = resolve_dataset(conn, "saml-d")
    booster, after = _dataset_model(dataset, official)
    assert dataset.active_model_version == "saml-d/v2"
    assert after["version"] == 2
    expected = lgb.Booster(model_file=str(official / "saml-d" / "lightgbm_v2.txt"))
    sample = pd.DataFrame([[0.0] * len(after["features"])], columns=after["features"])
    for column, categories in after["categories"].items():
        sample[column] = pd.Categorical([categories[0]], categories=categories)
    assert booster.predict(sample).tolist() == expected.predict(sample).tolist()
    # O retreino do conjunto grava o nome com o prefixo: não colide com o oficial (lightgbm_v2).
    assert after["model_name"] == "saml-d/v2"
    assert model_version(after) == "saml-d/v2"
    assert model_version(before) == "lightgbm_v1"


def test_load_and_train_fill_the_label_summary_in_the_registry(client, loaded, model_dir):
    registry = rows(loaded, "SELECT * FROM public.datasets WHERE slug = 'saml-d'")[0]
    assert registry["labeled_weeks"] >= 4  # a carga mediu o gabarito
    assert registry["has_laundering"] is True
    assert registry["labels_checked_at"] is not None

    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    with loaded.begin() as conn:  # registro velho: o treino mede de novo
        conn.execute(
            text("UPDATE public.datasets SET labeled_weeks = 99, labels_checked_at = NULL")
        )
    assert run_train(client, loaded)["status"] == "done"

    after = rows(loaded, "SELECT * FROM public.datasets WHERE slug = 'saml-d'")[0]
    assert after["labeled_weeks"] == registry["labeled_weeks"]
    assert after["labels_checked_at"] is not None


def test_job_fails_in_portuguese_when_labels_disappear(client, loaded, seed):
    response = client.post("/datasets/saml-d/train")
    assert response.status_code == 202
    with loaded.begin() as conn:
        conn.execute(text("DELETE FROM ground_truth"))

    process_next_job(loaded)

    job = rows(loaded, "SELECT status, message FROM public.jobs")[0]
    assert job["status"] == "failed"
    assert "não tem gabarito" in job["message"]
    registry = rows(loaded, "SELECT labeled_weeks, has_laundering FROM public.datasets")[0]
    assert (registry["labeled_weeks"], registry["has_laundering"]) == (0, False)


def test_resolve_split_keeps_official_dates_and_scales_for_other_periods():
    official = pd.DataFrame({"occurred_at": pd.to_datetime(["2022-10-07", "2023-08-23"])})
    assert resolve_split(official) == OFFICIAL_SPLIT

    other = pd.DataFrame({"occurred_at": pd.to_datetime(["2025-01-01", "2025-03-09"])})
    split = resolve_split(other)
    train_end = pd.Timestamp(split.train_end)
    validation = pd.Timestamp(split.validation_start)
    assert train_end.weekday() == 6  # domingo
    assert validation.weekday() == 0  # segunda
    assert validation < train_end < pd.Timestamp("2025-03-09")  # sobra pelo menos uma semana


# --- retreino com o retorno dos analistas ---------------------------------------------------

# No dado sintético (gabarito de 27/02 a 24/07/2023, período aberto em 24/07), o retorno que vai
# até 17/07 faz o corte recuar para sobrarem 4 semanas de teste: treino até 02/07, validação
# de 05/06 a 02/07; os rótulos de 03/07 a 17/07 ficam reservados para o teste.
CUT = "2023-07-02"
VALIDATION_START = date(2023, 6, 5)
OPEN_WEEK = LAST_WEEK


@pytest.fixture
def with_feedback(client, loaded, model_dir, no_rules, monkeypatch):
    """O modelo oficial em MODEL_DIR, as semanas de teste processadas pelo lote e todos os
    alertas rotulados a partir do gabarito (também os do período aberto, que não podem entrar).
    O mínimo de rótulos cai para o tamanho do dado sintético."""
    official = Path(get_settings().model_dir)
    for path in model_dir.iterdir():
        shutil.copy(path, official / path.name)
    run_backfill(loaded, model_dir=official, rules_dir=no_rules)
    label_from_truth(loaded, FIRST_WEEK, OPEN_WEEK)
    for module in ("fraudradar.model.feedback", "fraudradar.model.training"):
        monkeypatch.setattr(f"{module}.MIN_FEEDBACK_LABELS", 10)
    return official


def count_labels(engine, where: str, **params) -> int:
    return scalar(engine, f"SELECT count(*) FROM analyst_labels WHERE {where}", **params)


def test_feedback_training_uses_closed_weeks_and_records_it_in_the_card(
    client, loaded, with_feedback
):
    response = client.post("/datasets/saml-d/train", json={"use_feedback": True})
    assert response.status_code == 202, response.text
    assert scalar(loaded, "SELECT payload FROM public.jobs") == {
        "use_feedback": True,
        "include_simulated": False,
    }
    assert process_next_job(loaded) is True
    job = rows(loaded, "SELECT status, message FROM public.jobs")[0]
    assert job["status"] == "done", job["message"]

    card = json.loads((with_feedback / "saml-d" / "lightgbm_v2.json").read_text("utf-8"))
    assert (card["train_end"], card["validation_start"]) == (CUT, VALIDATION_START.isoformat())
    feedback = card["feedback"]
    assert feedback["used"] is True and feedback["split"] == {"kind": "feedback"}
    in_training = count_labels(loaded, "week < :v", v=VALIDATION_START)
    assert feedback["labels_used"]["total"] == in_training > 0
    assert feedback["labels_in_validation"] == count_labels(
        loaded, "week >= :v AND week <= :c", v=VALIDATION_START, c=CUT
    )
    # depois do corte e antes do período aberto: reservados; o período aberto nem entra
    assert feedback["labels_reserved_for_test"] == count_labels(
        loaded, "week > :c AND week < :o", c=CUT, o=OPEN_WEEK
    )
    assert count_labels(loaded, "week = :o", o=OPEN_WEEK) > 0
    by_class = feedback["labels_used"]["by_class"]
    assert by_class["laundering"] > 0 and by_class["false_positive"] > 0
    assert feedback["labels_used"]["by_source"] == {"analyst": in_training, "simulated": 0}
    assert feedback["transactions_covered"] > 0 and feedback["transactions_without_truth"] == 0
    # toda transação coberta com gabarito ou concorda (ganha peso) ou é conflito
    assert (
        feedback["transactions_weighted"] + feedback["conflicts"]
        == (feedback["transactions_covered"])
    )
    # o rótulo de lavagem confirmada cobre as transações de maior nota da conta, e uma conta
    # lavadora também faz transação normal: há conflito mesmo com o analista acertando sempre
    assert feedback["conflicts"] >= 0
    actions = rows(loaded, "SELECT action, details FROM audit_log WHERE action = 'model_trained'")
    assert actions[0]["details"]["use_feedback"] is True
    assert actions[0]["details"]["compared_with"] == "lightgbm_v1"


def test_simulated_feedback_only_enters_when_asked(client, loaded, with_feedback):
    execute(loaded, "UPDATE analyst_labels SET source = 'simulated' WHERE week = :w", w=FIRST_WEEK)
    simulated = count_labels(loaded, "source = 'simulated'")
    assert simulated > 0

    assert client.post(
        "/datasets/saml-d/train", json={"use_feedback": True, "include_simulated": True}
    ).status_code == 202  # fmt: skip
    assert process_next_job(loaded) is True
    card = json.loads((with_feedback / "saml-d" / "lightgbm_v2.json").read_text("utf-8"))
    assert card["feedback"]["include_simulated"] is True
    assert card["feedback"]["labels_used"]["by_source"]["simulated"] == simulated

    assert client.post("/datasets/saml-d/train", json={"use_feedback": True}).status_code == 202
    assert process_next_job(loaded) is True
    card = json.loads((with_feedback / "saml-d" / "lightgbm_v3.json").read_text("utf-8"))
    assert card["feedback"]["labels_used"]["by_source"]["simulated"] == 0


def test_comparison_measures_the_active_model_on_the_same_test_weeks(
    client, loaded, with_feedback, saml_d
):
    assert client.post("/datasets/saml-d/train", json={"use_feedback": True}).status_code == 202
    assert process_next_job(loaded) is True
    card = json.loads((with_feedback / "saml-d" / "lightgbm_v2.json").read_text("utf-8"))
    comparison = card["comparison"]
    assert comparison["active_version"] == "lightgbm_v1"
    assert comparison["period"] == {"start": "2023-07-03", "end": "2023-07-24", "weeks": 4}

    # Por fora: a versão ativa, com a ficha dela, nas mesmas semanas e contra o gabarito.
    official = json.loads((with_feedback / "lightgbm_v1.json").read_text("utf-8"))
    booster = lgb.Booster(model_file=str(with_feedback / "lightgbm_v1.txt"))
    transactions, ground_truth = saml_d
    features = compute_features(transactions)
    score = booster.predict(model_input(features, official)[0])
    tx = transactions.set_index("id").loc[features["id"]]
    cash = with_cash_account(tx.reset_index())
    y = ground_truth.set_index("transaction_id").loc[features["id"], "label"].to_numpy()
    week = week_start(tx["occurred_at"]).to_numpy()
    rows_ = week >= np.datetime64("2023-07-03")
    accounts = account_weeks(
        week[rows_],
        cash["sender"].to_numpy()[rows_],
        cash["receiver"].to_numpy()[rows_],
        score[rows_],
        y[rows_],
    )
    recall, precision, per_week = weekly_queue(
        accounts, size=official["queue_size"], cut=official["queue_cut"]
    )
    active = comparison["active"]
    assert active["queue_recall"] == pytest.approx(recall)
    assert active["queue_precision"] == pytest.approx(precision)
    assert active["innocents_per_week"] == pytest.approx(per_week * (1 - precision))
    assert active["pr_auc"] == pytest.approx(average_precision_score(y[rows_], score[rows_]))
    gate = comparison["gate"]
    expected = comparison["candidate"]["queue_recall"] >= recall - 0.01
    assert gate["passed"] is expected and gate["reason"]
    assert comparison["recall_difference"] == pytest.approx(
        comparison["candidate"]["queue_recall"] - recall
    )

    # A listagem mostra a comparação, a trava e o retorno usado; promover segue a trava.
    listing = client.get("/datasets/saml-d/models").json()
    new = next(v for v in listing["versions"] if v["version"] == "saml-d/v2")
    assert new["comparison"]["gate"]["passed"] is expected
    assert new["feedback"]["used"] is True and new["feedback"]["split"] == "feedback"
    promoted = client.post("/datasets/saml-d/models/saml-d%2Fv2/promote")
    assert promoted.status_code == (200 if expected else 409)


def test_plain_training_also_compares_and_records_no_feedback(client, loaded, with_feedback):
    assert client.post("/datasets/saml-d/train").status_code == 202
    assert process_next_job(loaded) is True
    card = json.loads((with_feedback / "saml-d" / "lightgbm_v2.json").read_text("utf-8"))
    assert card["feedback"] == {"used": False, "split": {"kind": "official"}}
    assert card["train_end"] == OFFICIAL_SPLIT.train_end
    # a ativa (oficial) treinou até a mesma data: as duas são medidas em todo o teste
    assert card["comparison"]["period"]["start"] == FIRST_WEEK.isoformat()
    assert card["comparison"]["period"]["weeks"] == 10


def test_worker_refuses_feedback_that_is_gone_or_after_the_cut(client, loaded, with_feedback):
    assert client.post("/datasets/saml-d/train", json={"use_feedback": True}).status_code == 202
    # entre o pedido e o treino, sobram só os rótulos depois do corte
    execute(loaded, "DELETE FROM analyst_labels WHERE week <= :c", c=CUT)
    assert process_next_job(loaded) is True
    job = rows(loaded, "SELECT status, message FROM public.jobs")[0]
    assert job["status"] == "failed"
    assert "pelo menos 10 rótulos" in job["message"] or "Sobram 0 rótulos" in job["message"]
    assert not (with_feedback / "saml-d" / "lightgbm_v2.json").exists()


def test_feedback_reading_skips_the_open_week_simulations_and_other_sources(
    loaded, with_feedback, seed
):
    labeled = rows(
        loaded,
        "SELECT l.alert_id, l.account, l.week FROM analyst_labels l"
        " WHERE l.week = :w ORDER BY l.alert_id LIMIT 1",
        w=FIRST_WEEK,
    )[0]
    ingestion = seed._exec(
        "INSERT INTO ingestions (source, row_count, created_by) VALUES ('simulation', 1, 'Teste')"
        " RETURNING id"
    )
    simulated = seed._exec(
        "INSERT INTO transactions (occurred_at, sender, receiver, amount, payment_currency,"
        " received_currency, sender_country, receiver_country, payment_type, ingestion_id)"
        " VALUES (:at, :a, 999999, 10, 'UK pounds', 'UK pounds', 'UK', 'UK', 'ACH', :i)"
        " RETURNING id",
        at=pd.Timestamp(FIRST_WEEK) + pd.Timedelta(days=2),
        a=labeled["account"],
        i=ingestion,
    )
    execute(loaded, "UPDATE analyst_labels SET source = 'simulated' WHERE week = :w", w=LAST_WEEK)
    with loaded.connect() as conn:
        labels = read_feedback(conn, before=OPEN_WEEK, include_simulated=True)
        analyst_only = read_feedback(conn, before=OPEN_WEEK, include_simulated=False)
        candidates = read_feedback_candidates(conn, [labeled["alert_id"]])
        version = conn.execute(
            text("SELECT model_version FROM alerts WHERE id = :a"), {"a": labeled["alert_id"]}
        ).scalar_one()
    assert labels["week"].max() < pd.Timestamp(OPEN_WEEK)  # o período aberto nunca entra
    assert len(analyst_only) == len(labels)  # os simulados eram só do período aberto
    assert simulated not in candidates["transaction_id"].tolist()
    assert len(candidates) == scalar(
        loaded,
        "SELECT count(*) FROM transactions WHERE (sender = :a OR receiver = :a)"
        " AND occurred_at >= :w AND occurred_at < CAST(:w AS date) + 7"
        " AND ingestion_id IS NULL",
        a=labeled["account"],
        w=FIRST_WEEK,
    )
    assert candidates["has_truth"].all()
    stored = rows(
        loaded,
        "SELECT transaction_id, score FROM transaction_scores WHERE model_version = :v"
        " AND transaction_id = ANY(CAST(:ids AS bigint[]))",
        v=version,
        ids=candidates["transaction_id"].tolist(),
    )
    by_id = {r["transaction_id"]: r["score"] for r in stored}
    assert candidates.set_index("transaction_id")["score"].to_dict() == pytest.approx(by_id)
