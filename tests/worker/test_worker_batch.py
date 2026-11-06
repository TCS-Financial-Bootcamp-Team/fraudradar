"""`worker batch`: o que uma semana grava, a fila igual à da avaliação do modelo, os mesmos
scores do modelo, o gabarito fora do score e o reprocessamento que nunca apaga trabalho de
analista."""

from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from worker_helpers import (  # noqa: E402
    FIRST_WEEK,
    IN_SAMPLE_WEEK,
    execute,
    rows,
    scalar,
    week_bounds,
)

from fraudradar.features.history import (  # noqa: E402
    CASH_ACCOUNT,
    compute_features,
    week_start,
    with_cash_account,
)
from fraudradar.model.evaluation import account_weeks  # noqa: E402
from fraudradar.model.training import load_model  # noqa: E402
from worker.batch import run_batch  # noqa: E402
from worker.errors import WorkerError  # noqa: E402

SIGNALS = {
    "sent_count",
    "received_count",
    "sent_amount",
    "received_amount",
    "distinct_counterparties",
    "cash_share",
    "cross_border_share",
}


@pytest.fixture
def batch(loaded, model_dir, no_rules):
    """Roda o lote como a CLI, com o modelo e as regras de teste."""

    def run(week=FIRST_WEEK, **options):
        return run_batch(loaded, week, model_dir=model_dir, rules_dir=no_rules, **options)

    return run


def _alerts(engine, week=FIRST_WEEK) -> list[dict]:
    return rows(
        engine,
        "SELECT a.id, a.account, a.score, a.queue_position, a.status, a.countries, a.typology,"
        " a.total_amount, a.transaction_count, a.model_version, e.contributions, e.rules,"
        " e.weekly_signals, e.graph"
        " FROM alerts a JOIN evidence e ON e.alert_id = a.id WHERE a.week = :week"
        " ORDER BY a.queue_position",
        week=week,
    )


def _snapshot(engine) -> dict:
    """O que o modelo produz: scores, fila e evidências (sem ids nem datas de gravação)."""
    alerts = [{k: v for k, v in a.items() if k != "id"} for a in _alerts(engine)]
    scores = rows(engine, "SELECT transaction_id, score FROM transaction_scores ORDER BY 1")
    return {"alerts": alerts, "scores": scores}


def _model_scores(model_dir, card, saml_d) -> pd.Series:
    """Score de cada transação pelo modelo, com compute_features no dado sintético inteiro,
    indexado pelo id do banco (linha do CSV + 1)."""
    booster, _ = load_model(model_dir)
    transactions, _ = saml_d
    features = compute_features(transactions)
    return pd.Series(booster.predict(features[card["features"]]), index=features["id"] + 1)


def test_batch_writes_the_week(batch, loaded, card):
    [week] = batch().processed
    alerts = _alerts(loaded)
    bounds = week_bounds(FIRST_WEEK)
    assert week.week == FIRST_WEEK and week.alerts == len(alerts) == card["queue_size"]
    # fila: posições 1..n, score não crescente, todos acima do corte, nunca o CAIXA
    assert [a["queue_position"] for a in alerts] == list(range(1, len(alerts) + 1))
    scores = [a["score"] for a in alerts]
    assert scores == sorted(scores, reverse=True)
    assert min(scores) >= np.float32(card["queue_cut"])
    assert all(a["account"] != CASH_ACCOUNT for a in alerts)
    assert {a["status"] for a in alerts} == {"new"} and {a["typology"] for a in alerts} == {None}
    assert {a["model_version"] for a in alerts} == {"lightgbm_v1"}
    for a in alerts:
        # totais = soma em SQL das transações da conta na semana (enviadas e recebidas)
        count, total = rows(
            loaded,
            "SELECT count(*) AS n, sum(amount) AS total FROM transactions"
            " WHERE (sender = :a OR receiver = :a) AND occurred_at >= :start"
            " AND occurred_at < :end",
            a=a["account"],
            **bounds,
        )[0].values()
        assert (a["transaction_count"], a["total_amount"]) == (count, total)
        # países pelo valor movimentado, do maior para o menor, sem repetir
        countries = rows(
            loaded,
            "SELECT country FROM (SELECT DISTINCT t.id, t.amount, c.country"
            " FROM transactions t, LATERAL (VALUES (t.sender_country), (t.receiver_country))"
            " AS c(country) WHERE (t.sender = :a OR t.receiver = :a)"
            " AND t.occurred_at >= :start AND t.occurred_at < :end) x"
            " GROUP BY country ORDER BY sum(amount) DESC, country",
            a=a["account"],
            **bounds,
        )
        assert a["countries"] == [c["country"] for c in countries]
        # evidência: todas as variáveis do modelo, sinais da semana, sem regras, grafo vazio
        assert set(a["contributions"]) == set(card["features"])
        assert set(a["weekly_signals"]) == SIGNALS and a["rules"] == [] and a["graph"] == {}
        signals = a["weekly_signals"]
        assert signals["sent_count"] + signals["received_count"] >= a["transaction_count"]
    # um score por transação da semana
    week_ids = rows(
        loaded,
        "SELECT id FROM transactions WHERE occurred_at >= :start AND occurred_at < :end"
        " ORDER BY id",
        **bounds,
    )
    scored = rows(
        loaded,
        "SELECT transaction_id AS id FROM transaction_scores"
        " WHERE model_version = 'lightgbm_v1' ORDER BY 1",
    )
    assert scored == week_ids
    # lote, contas ativas (CAIXA fora, contado em SQL) e auditoria
    active = scalar(
        loaded,
        "SELECT count(DISTINCT account) FROM ("
        " SELECT CASE WHEN payment_type = 'Cash Deposit' THEN -1 ELSE sender END AS account"
        " FROM transactions WHERE occurred_at >= :start AND occurred_at < :end"
        " UNION ALL"
        " SELECT CASE WHEN payment_type = 'Cash Withdrawal' THEN -1 ELSE receiver END"
        " FROM transactions WHERE occurred_at >= :start AND occurred_at < :end) a"
        " WHERE account <> -1",
        **bounds,
    )
    [batch_row] = rows(loaded, "SELECT * FROM weekly_batches")
    assert batch_row["week"] == FIRST_WEEK and batch_row["released_at"] is None
    assert batch_row["active_accounts"] == week.active_accounts == active
    assert batch_row["model_version"] == "lightgbm_v1"
    assert "typology_accuracy" not in batch_row["metrics"]
    [audit] = rows(loaded, "SELECT actor, action, entity, entity_id, details FROM audit_log")
    assert audit == {
        "actor": "worker",
        "action": "batch",
        "entity": "week",
        "entity_id": "2023-05-22",
        "details": {
            "alerts": len(alerts),
            "model_version": "lightgbm_v1",
            "active_accounts": active,
            "forced": False,
        },
    }


def test_model_version_is_the_card_and_the_only_active(batch, loaded, card, seed):
    seed.model("lightgbm_v0", active=True)
    batch()
    versions = {
        r["version"]: r
        for r in rows(
            loaded, "SELECT version, features, threshold, metrics, active FROM model_versions"
        )
    }
    assert versions["lightgbm_v0"]["active"] is False
    v1 = versions["lightgbm_v1"]
    assert v1["active"] is True and v1["features"] == card["features"]
    assert v1["threshold"] == pytest.approx(card["queue_cut"], rel=1e-6)
    assert v1["metrics"]["transaction_threshold"] == pytest.approx(card["transaction_threshold"])
    assert v1["metrics"]["queue_with_cut"] == pytest.approx(card["metrics"]["queue_with_cut"])


def test_queue_is_the_one_of_the_model_evaluation(batch, loaded, model_dir, card, saml_d):
    """A fila sai igual à de `evaluation.account_weeks` com o corte e o tamanho da ficha. O
    corte e o tamanho valem na semana: há conta acima do corte fora da fila (tamanho) e conta
    ativa abaixo do corte (corte)."""
    batch()
    transactions, ground_truth = saml_d
    score = _model_scores(model_dir, card, saml_d)
    tx = transactions.assign(id=transactions["id"] + 1).set_index("id").loc[score.index]
    cash = with_cash_account(tx.reset_index())
    y = ground_truth["label"].to_numpy()[score.index - 1]
    weeks = week_start(tx["occurred_at"]).to_numpy()
    accounts = account_weeks(
        weeks, cash["sender"].to_numpy(), cash["receiver"].to_numpy(), score.to_numpy(), y
    ).xs(pd.Timestamp(FIRST_WEEK), level="week")
    above = accounts[accounts["score"] >= card["queue_cut"]]
    assert card["queue_size"] < len(above) < len(accounts)
    expected = above.sort_values("score", ascending=False, kind="stable").head(card["queue_size"])
    assert [a["account"] for a in _alerts(loaded)] == expected.index.tolist()


def test_same_scores_as_the_model(batch, loaded, model_dir, card, saml_d):
    """O score de cada transação da semana é o de booster.predict sobre compute_features do dado
    inteiro: pega um início de histórico errado ou categorias erradas."""
    batch()
    stored = pd.DataFrame(rows(loaded, "SELECT transaction_id, score FROM transaction_scores"))
    stored = stored.set_index("transaction_id")["score"]
    expected = _model_scores(model_dir, card, saml_d).loc[stored.index]
    np.testing.assert_array_equal(stored.to_numpy("float32"), expected.to_numpy("float32"))
    # o teste tem dentes: com o histórico começando uma semana depois, algum score muda
    transactions, _ = saml_d
    booster, _ = load_model(model_dir)
    late = transactions[
        transactions["occurred_at"] >= transactions["occurred_at"].min() + timedelta(days=7)
    ]
    features = compute_features(late)
    late_score = pd.Series(booster.predict(features[card["features"]]), index=features["id"] + 1)
    assert (late_score.loc[stored.index].to_numpy("float32") != stored.to_numpy("float32")).any()


def test_ground_truth_does_not_change_scores_or_alerts(batch, loaded):
    """Sem vazamento: com todos os rótulos trocados, o reprocessamento dá os mesmos scores, a
    mesma fila e as mesmas evidências; só as métricas mudam."""
    batch()
    before = _snapshot(loaded)
    metrics_before = scalar(loaded, "SELECT metrics FROM weekly_batches")
    execute(loaded, "UPDATE ground_truth SET label = 1 - label")
    batch(force=True)
    assert _snapshot(loaded) == before
    assert scalar(loaded, "SELECT metrics FROM weekly_batches") != metrics_before


def test_second_batch_does_nothing(batch, loaded):
    batch()
    before = _snapshot(loaded)
    again = batch()
    assert again.processed == [] and "já processada" in again.notes[0]
    assert _snapshot(loaded) == before
    assert scalar(loaded, "SELECT count(*) FROM audit_log") == 1


def test_force_rewrites_the_week_with_the_same_alerts(batch, loaded):
    batch()
    before = _snapshot(loaded)
    ids_before = {a["id"] for a in _alerts(loaded)}
    assert len(batch(force=True).processed) == 1
    assert _snapshot(loaded) == before
    assert ids_before.isdisjoint({a["id"] for a in _alerts(loaded)})  # apagou e gravou de novo
    forced = [
        r["details"]["forced"] for r in rows(loaded, "SELECT details FROM audit_log ORDER BY id")
    ]
    assert forced == [False, True]


def test_force_is_refused_after_an_analyst_decision(batch, loaded, seed):
    batch()
    alert_id = _alerts(loaded)[0]["id"]
    seed.decision(alert_id, "archive")
    with pytest.raises(WorkerError, match="decisão de analista"):
        batch(force=True)
    assert scalar(loaded, "SELECT count(*) FROM decisions WHERE alert_id = :a", a=alert_id) == 1
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 1


def test_force_is_refused_after_release(batch, loaded):
    batch()
    execute(loaded, "UPDATE weekly_batches SET released_at = now()")
    with pytest.raises(WorkerError, match="liberada no replay"):
        batch(force=True)
    assert scalar(loaded, "SELECT released_at IS NOT NULL FROM weekly_batches") is True


def test_force_is_refused_when_an_alert_left_new(batch, loaded):
    batch()
    execute(loaded, "UPDATE alerts SET status = 'in_review' WHERE queue_position = 1")
    with pytest.raises(WorkerError, match="saíram do status new"):
        batch(force=True)


def test_in_sample_week_is_refused_without_the_flag(batch, loaded):
    with pytest.raises(WorkerError, match="--allow-in-sample"):
        batch(IN_SAMPLE_WEEK)
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 0
    assert len(batch(IN_SAMPLE_WEEK, allow_in_sample=True).processed) == 1


def test_week_must_be_a_monday(batch, loaded):
    with pytest.raises(WorkerError, match="não é segunda-feira"):
        batch(FIRST_WEEK + timedelta(days=1))


def test_week_without_transactions_has_nothing_to_do(batch, loaded):
    result = batch(FIRST_WEEK + timedelta(weeks=52))
    assert result.processed == [] and "sem transações" in result.notes[0]
    assert scalar(loaded, "SELECT count(*) FROM weekly_batches") == 0


def test_segments_are_set_for_the_active_accounts(batch, loaded):
    batch()
    counts = rows(
        loaded,
        "SELECT count(*) AS accounts, count(segment) AS with_segment FROM accounts",
    )[0]
    active = scalar(loaded, "SELECT active_accounts FROM weekly_batches")
    assert counts["with_segment"] == active < counts["accounts"]


def test_missing_model_is_an_error(loaded, tmp_path):
    with pytest.raises(WorkerError, match="nenhum modelo"):
        run_batch(loaded, FIRST_WEEK, model_dir=tmp_path)
