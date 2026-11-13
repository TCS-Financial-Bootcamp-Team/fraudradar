"""O que o worker grava, lido pela API: fila, detail, replay e monitoramento."""

import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, scalar  # noqa: E402

from worker.batch import run_batch  # noqa: E402


def test_queue_detail_replay_and_monitoring(client, loaded, model_dir, no_rules):
    [week] = run_batch(loaded, FIRST_WEEK, model_dir=model_dir, rules_dir=no_rules).processed
    params = {"week": FIRST_WEEK.isoformat()}

    # Toda semana processada aparece sem liberação.
    assert client.get("/weeks").json() == {
        "current": "2023-05-22",
        "next_release": None,
        "items": [
            {
                "week": "2023-05-22",
                "alerts": week.alerts,
                "pending": week.alerts,
            }
        ],
    }
    released = client.post("/replay/next-week", json={}).json()
    assert released == {"week": "2023-05-22", "alerts_generated": week.alerts}

    # A fila lista os alertas do modelo e, no fim, a amostra de controle.
    listed = client.get("/alerts", params={**params, "sort": "queue", "size": 100}).json()
    assert listed["total"] == week.alerts + week.exploration
    assert [a["origin"] for a in listed["items"]] == (
        ["model"] * week.alerts + ["exploration"] * week.exploration
    )
    queue = client.get(
        "/alerts", params={**params, "sort": "queue", "size": 100, "origin": "model"}
    ).json()
    assert queue["total"] == week.alerts
    assert [a["queue_position"] for a in queue["items"]] == list(range(1, week.alerts + 1))
    by_score = client.get("/alerts", params={**params, "size": 100}).json()["items"]
    assert [a["score"] for a in by_score] == sorted((a["score"] for a in by_score), reverse=True)
    assert {a["typology"] for a in queue["items"]} == {"Indefinida"}
    assert {a["status"] for a in queue["items"]} == {"pending"}

    first = queue["items"][0]
    detail = client.get(f"/alerts/{first['id']}").json()
    assert detail["contributions"] and detail["rules"] == []
    assert len(detail["movements"]) == min(first["transaction_count"], 200)
    assert sum(m["amount"] for m in detail["movements"]) == pytest.approx(first["amount"])
    graph = client.get(f"/alerts/{first['id']}/graph").json()
    assert graph["nodes"][0] == {"id": first["account"], "label": first["account"], "central": True}

    monitoring = client.get("/monitoring", params=params).json()
    metrics = scalar(loaded, "SELECT metrics FROM weekly_batches")
    indicators = monitoring["indicators"]
    # o worker mede o recall contra o gabarito, mas ele não vai para as telas
    assert metrics["recall"] is not None and "recall" not in indicators
    assert indicators["alerts"] == week.alerts
    assert indicators["alert_rate"] == pytest.approx(week.alerts / week.active_accounts)
    rates = {s["name"]: s["value"] for s in monitoring["payment_type_rates"]}
    assert rates == pytest.approx(metrics["payment_type_rates"])
    assert {s["name"] for s in monitoring["country_rates"]} == set(metrics["country_rates"])
