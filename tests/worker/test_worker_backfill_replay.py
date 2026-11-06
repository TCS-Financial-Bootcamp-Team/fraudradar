"""`worker backfill` (várias semanas, variáveis calculadas uma vez) e `worker replay` (a próxima
semana, sem liberar nada)."""

from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from worker_helpers import (  # noqa: E402
    FIRST_WEEK,
    IN_SAMPLE_WEEK,
    LAST_WEEK,
    TEST_WEEKS,
    rows,
    scalar,
)

from fraudradar.features.history import compute_features  # noqa: E402
from fraudradar.model.training import load_model  # noqa: E402
from worker import batch as batch_module  # noqa: E402
from worker.batch import run_backfill, run_batch, run_replay  # noqa: E402
from worker.errors import WorkerError  # noqa: E402


@pytest.fixture
def options(model_dir, no_rules) -> dict:
    return {"model_dir": model_dir, "rules_dir": no_rules}


def test_backfill_processes_every_week_after_training(loaded, options, model_dir, card, saml_d):
    result = run_backfill(loaded, **options)
    assert [w.week for w in result.processed] == TEST_WEEKS
    weeks = rows(loaded, "SELECT week, released_at FROM weekly_batches ORDER BY week")
    assert [w["week"] for w in weeks] == TEST_WEEKS
    assert all(w["released_at"] is None for w in weeks)  # liberar é com a API
    # as variáveis calculadas uma vez para o período inteiro dão os scores do modelo
    booster, _ = load_model(model_dir)
    transactions, _ = saml_d
    features = compute_features(transactions)
    expected = pd.Series(booster.predict(features[card["features"]]), index=features["id"] + 1)
    stored = pd.DataFrame(rows(loaded, "SELECT transaction_id, score FROM transaction_scores"))
    stored = stored.set_index("transaction_id")["score"]
    in_test = transactions["occurred_at"] >= pd.Timestamp(FIRST_WEEK)
    assert sorted(stored.index) == (transactions.loc[in_test, "id"] + 1).tolist()
    np.testing.assert_array_equal(
        stored.to_numpy("float32"), expected.loc[stored.index].to_numpy("float32")
    )


def test_backfill_computes_features_once(loaded, options, monkeypatch):
    calls = []
    real = batch_module.compute_features
    monkeypatch.setattr(batch_module, "compute_features", lambda tx: calls.append(1) or real(tx))
    run_backfill(loaded, **options)
    assert len(calls) == 1


def test_backfill_gives_the_same_alerts_as_one_batch_per_week(loaded, options):
    run_backfill(loaded, FIRST_WEEK, FIRST_WEEK + timedelta(weeks=2), **options)
    together = rows(
        loaded, "SELECT week, account, score, queue_position FROM alerts ORDER BY week, 4"
    )
    with loaded.begin() as conn:
        conn.exec_driver_sql("TRUNCATE alerts, transaction_scores, weekly_batches CASCADE")
    for i in range(3):
        run_batch(loaded, FIRST_WEEK + timedelta(weeks=i), **options)
    one_by_one = rows(
        loaded, "SELECT week, account, score, queue_position FROM alerts ORDER BY week, 4"
    )
    assert together == one_by_one and together


def test_backfill_range_and_reruns(loaded, options):
    second, third = TEST_WEEKS[1], TEST_WEEKS[2]
    result = run_backfill(loaded, second, third, **options)
    assert [w.week for w in result.processed] == [second, third]
    again = run_backfill(loaded, FIRST_WEEK, third, **options)
    assert [w.week for w in again.processed] == [FIRST_WEEK]  # as outras já estavam prontas
    assert sum("já processada" in note for note in again.notes) == 2


def test_backfill_refuses_bad_ranges(loaded, options):
    with pytest.raises(WorkerError, match="vem depois de"):
        run_backfill(loaded, TEST_WEEKS[2], TEST_WEEKS[1], **options)
    with pytest.raises(WorkerError, match="--allow-in-sample"):
        run_backfill(loaded, IN_SAMPLE_WEEK, FIRST_WEEK, **options)
    with pytest.raises(WorkerError, match="não é segunda-feira"):
        run_backfill(loaded, FIRST_WEEK + timedelta(days=2), **options)
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 0


def test_backfill_with_force_refuses_everything_if_one_week_is_protected(loaded, options):
    run_backfill(loaded, FIRST_WEEK, TEST_WEEKS[1], **options)
    with loaded.begin() as conn:
        conn.exec_driver_sql(
            "UPDATE weekly_batches SET released_at = now() WHERE week = '2023-05-29'"
        )
    before = scalar(loaded, "SELECT max(processed_at) FROM weekly_batches")
    with pytest.raises(WorkerError, match="2023-05-29: já foi liberada"):
        run_backfill(loaded, FIRST_WEEK, TEST_WEEKS[1], force=True, **options)
    assert scalar(loaded, "SELECT max(processed_at) FROM weekly_batches") == before


def test_backfill_on_an_empty_database_has_nothing_to_do(db, options):
    result = run_backfill(db, **options)
    assert result.processed == [] and "não tem transações" in result.notes[0]


def test_replay_processes_the_next_week_and_then_nothing(loaded, options):
    first = run_replay(loaded, **options)
    assert [w.week for w in first.processed] == [FIRST_WEEK]  # sem lote: o primeiro fora do treino
    second = run_replay(loaded, **options)
    assert [w.week for w in second.processed] == [TEST_WEEKS[1]]
    run_backfill(loaded, **options)
    last = run_replay(loaded, **options)
    assert last.processed == [] and last.notes[0].startswith("nada a processar")
    assert scalar(loaded, "SELECT max(week) FROM weekly_batches") == LAST_WEEK
    # replay só processa: nada foi liberado
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches WHERE released_at IS NOT NULL") == 0


def test_replay_skips_to_the_first_week_after_training(loaded, options):
    """Com só uma semana do treino processada (--allow-in-sample), o replay não continua no
    treino: vai para a primeira semana depois dele."""
    run_batch(loaded, IN_SAMPLE_WEEK, allow_in_sample=True, **options)
    assert [w.week for w in run_replay(loaded, **options).processed] == [FIRST_WEEK]
