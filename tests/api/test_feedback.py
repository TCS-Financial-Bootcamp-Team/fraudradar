"""GET /feedback/summary: o que os analistas confirmaram, o que a amostra de controle achou fora da
fila e se o conjunto pode retreinar com o retorno. Nunca lê ground_truth."""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import event, text

from api.repositories.feedback import LOW_SAMPLE
from fraudradar.config import get_settings
from worker.labels import refresh_label_stats

W1, W2, W3 = date(2023, 5, 22), date(2023, 5, 29), date(2023, 6, 5)
OPEN = date(2023, 7, 17)


def _summary(client, **params) -> dict:
    response = client.get("/feedback/summary", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _labeled(seed, account, week, label, *, origin="model", source="analyst") -> int:
    alert_id = seed.alert(account, week, origin=origin, position=account)
    seed.label(alert_id, label, source=source)
    return alert_id


def _official_card(created_at: str) -> None:
    root = Path(get_settings().model_dir)
    (root / "lightgbm_v1.txt").write_text("modelo", encoding="utf-8")
    card = {"version": 1, "created_at": created_at, "file": "lightgbm_v1.txt", "metrics": {}}
    (root / "lightgbm_v1.json").write_text(json.dumps(card), encoding="utf-8")


def test_empty_dataset(client):
    body = _summary(client)
    assert body["labels"]["total"] == 0
    assert body["confirmed_precision"] == {
        "value": None,
        "numerator": 0,
        "denominator": 0,
        "low_sample": True,
    }
    assert body["weekly_confirmed_precision"] == []
    assert body["control_sample"]["sampled"] == 0
    assert body["control_sample"]["found_outside_queue"]["value"] is None
    assert body["retrain"]["can_retrain"] is False
    assert "não tem gabarito" in body["retrain"]["reason"]


def test_labels_confirmed_precision_and_weekly_series(client, seed):
    # semana 1: 3 lavagens confirmadas e 1 falso positivo na fila do modelo
    for account in (1, 2, 3):
        _labeled(seed, account, W1, 1)
    _labeled(seed, 4, W1, 0)
    # semana 2: 1 lavagem (simulada) e 1 falso positivo; uma decisão sem rótulo não conta
    _labeled(seed, 5, W2, 1, source="simulated")
    _labeled(seed, 6, W2, 0)
    seed.decision(seed.alert(7, W2, position=7), "escalate")
    # amostra de controle: fora da precisão confirmada
    _labeled(seed, 8, W2, 1, origin="exploration")
    _labeled(seed, 9, W2, 0, origin="exploration")
    seed.alert(10, W2, origin="exploration", position=10)  # sorteada, ainda sem decisão

    body = _summary(client)

    assert body["labels"] == {
        "total": 8,
        "laundering": 5,
        "false_positive": 3,
        "analyst": 7,
        "simulated": 1,
        "model": 6,
        "exploration": 2,
    }
    assert body["confirmed_precision"] == {
        "value": pytest.approx(4 / 6),
        "numerator": 4,
        "denominator": 6,
        "low_sample": True,
    }
    assert [(w["week"], w["name"], w["numerator"], w["denominator"]) for w in
            body["weekly_confirmed_precision"]] == [
        ("2023-05-22", "22 mai", 3, 4),
        ("2023-05-29", "29 mai", 1, 2),
    ]  # fmt: skip
    assert body["weekly_confirmed_precision"][0]["value"] == pytest.approx(0.75)
    sample = body["control_sample"]
    assert (sample["sampled"], sample["reviewed"]) == (3, 2)
    assert sample["found_outside_queue"]["value"] == pytest.approx(0.5)
    assert sample["found_outside_queue"]["low_sample"] is True


def test_range_and_low_sample_flag(client, seed):
    for account in range(1, LOW_SAMPLE + 1):
        _labeled(seed, account, W1, 1 if account % 4 else 0)
    _labeled(seed, 100, W3, 0)

    whole = _summary(client)
    assert whole["confirmed_precision"]["denominator"] == LOW_SAMPLE + 1
    assert whole["confirmed_precision"]["low_sample"] is False
    week1 = whole["weekly_confirmed_precision"][0]
    assert (week1["denominator"], week1["low_sample"]) == (LOW_SAMPLE, False)

    # datas quaisquer: vale a segunda da semana
    only_w3 = _summary(client, **{"from": "2023-06-07", "to": "2023-06-11"})
    assert (only_w3["start"], only_w3["end"]) == ("2023-06-05", "2023-06-05")
    assert only_w3["labels"]["total"] == 1
    assert only_w3["confirmed_precision"]["value"] == 0.0
    until_w1 = _summary(client, to=W1.isoformat())
    assert until_w1["labels"]["total"] == LOW_SAMPLE


def test_new_labels_since_the_active_version(client, seed):
    _labeled(seed, 1, W1, 1)
    _labeled(seed, 2, W1, 0)
    _official_card("2020-01-01T00:00:00-03:00")
    body = _summary(client)
    assert (body["active_version"], body["new_since_active"]) == ("lightgbm_v1", 2)

    future = (datetime.now().astimezone() + timedelta(days=1)).isoformat(timespec="seconds")
    _official_card(future)
    assert _summary(client)["new_since_active"] == 0


def test_retrain_status_follows_the_closed_week_labels(client, seed):
    seed.account(1)
    seed.account(2)
    for i in range(8):  # gabarito suficiente para o retreino só com ele
        seed.transaction(1, 2, datetime(2023, 4, 3) + timedelta(weeks=i), label=int(i == 0))
    seed.transaction(1, 2, datetime.combine(OPEN, datetime.min.time()))  # período aberto
    refresh_label_stats(seed.engine)
    for account in range(10, 50):
        _labeled(seed, account, W1, 0, source="simulated")
    for account in range(50, 65):
        _labeled(seed, account, W2, 1, source="simulated")
    _labeled(seed, 70, OPEN, 1)  # período aberto: não conta

    retrain = _summary(client)["retrain"]
    assert retrain["can_retrain"] is False and "há 0" in retrain["reason"]
    assert retrain["can_retrain_with_simulated"] is True
    assert retrain["reason_with_simulated"] is None


def test_unknown_dataset_is_404(client):
    response = client.get("/feedback/summary", headers={"X-Dataset": "nao-existe"})
    assert response.status_code == 404


def test_never_reads_ground_truth(client, seed, db):
    _labeled(seed, 1, W1, 1)
    seed.alert(2, W1, origin="exploration", position=2)
    seed.batch(W1, metrics={"recall": 0.9})
    statements: list[str] = []

    @event.listens_for(db, "before_cursor_execute")
    def capture(_conn, _cursor, statement, *_rest):
        statements.append(statement)

    try:
        assert client.get("/feedback/summary").status_code == 200
        assert client.get("/monitoring", params={"week": W1.isoformat()}).status_code == 200
    finally:
        event.remove(db, "before_cursor_execute", capture)
    assert statements
    assert not [s for s in statements if "ground_truth" in s.lower()]
    with db.connect() as conn:  # o rótulo do analista nunca vai para o gabarito
        assert conn.execute(text("SELECT count(*) FROM ground_truth")).scalar_one() == 0
