"""Configuração, enfileiramento do simulador e remoção segura de simulações."""

from datetime import date, datetime

W1 = date(2026, 10, 5)


def _simulation(seed, *, occurred_at=datetime(2026, 10, 6, 12), source="simulation"):
    ingestion_id = seed._exec(
        "INSERT INTO ingestions (source, row_count, created_by)"
        " VALUES (:source, 1, 'Teste') RETURNING id",
        source=source,
    )
    seed._exec(
        "INSERT INTO transactions (occurred_at, sender, receiver, amount, payment_currency,"
        " received_currency, sender_country, receiver_country, payment_type, ingestion_id)"
        " VALUES (:at, 101, 202, 100, 'UK pounds', 'UK pounds', 'UK', 'UK', 'Wire', :id)",
        at=occurred_at,
        id=ingestion_id,
    )
    return ingestion_id


def test_processing_settings_are_editable_and_audited(client, seed):
    current = client.get("/processing/settings")
    assert current.status_code == 200
    assert current.json()["interval_minutes"] == 60
    assert current.json()["exploration_per_week"] == 5  # a amostra de controle nasce ligada

    updated = client.put(
        "/processing/settings",
        json={
            "interval_minutes": 15,
            "enabled": False,
            "demo_mode": True,
            "exploration_per_week": 12,
        },
    )

    assert updated.status_code == 200
    assert updated.json()["last_run_at"] is None
    assert updated.json()["interval_minutes"] == 15
    assert updated.json()["enabled"] is False
    assert updated.json()["demo_mode"] is True
    assert updated.json()["exploration_per_week"] == 12
    assert client.get("/processing/settings").json()["exploration_per_week"] == 12
    assert seed.count("audit_log", "action = 'processing_settings_updated'") == 1
    audit = seed.row("SELECT details FROM audit_log")
    assert audit["details"]["exploration_per_week"] == 12


def test_control_sample_size_is_between_0_and_50(client, seed):
    def save(size):
        body = {"interval_minutes": 60, "enabled": True, "demo_mode": False}
        return client.put("/processing/settings", json={**body, "exploration_per_week": size})

    assert save(0).json()["exploration_per_week"] == 0  # 0 desliga a amostra
    assert save(50).status_code == 200
    assert save(51).status_code == 422
    assert save(-1).status_code == 422
    missing = client.put(
        "/processing/settings",
        json={"interval_minutes": 60, "enabled": True, "demo_mode": False},
    )
    assert missing.status_code == 422
    assert client.get("/processing/settings").json()["exploration_per_week"] == 50


def test_simulate_endpoint_enqueues_the_validated_job(client):
    response = client.post(
        "/datasets/saml-d/simulate",
        json={"transactions": 250, "days": 3, "inject_pattern": True},
    )
    assert response.status_code == 202
    assert (response.json()["kind"], response.json()["status"]) == ("simulate", "queued")


def test_delete_simulation_removes_transactions_reopens_week_and_enqueues_process(client, seed):
    ingestion_id = _simulation(seed)
    seed.batch(W1)
    seed.alert(101, W1)

    response = client.delete(f"/ingestions/{ingestion_id}")

    assert response.status_code == 202
    assert response.json()["kind"] == "process"
    assert seed.count("transactions", "ingestion_id = :id", id=ingestion_id) == 0
    assert seed.count("ingestions", "id = :id", id=ingestion_id) == 0
    assert seed.count("weekly_batches") == 0
    assert seed.count("alerts") == 0
    assert seed.count("audit_log", "action = 'simulation_deleted'") == 1


def test_delete_simulation_refuses_closed_period_or_touched_decision(client, seed):
    closed_id = _simulation(seed)
    seed.transaction(303, 404, datetime(2026, 10, 13, 12))
    closed = client.delete(f"/ingestions/{closed_id}")
    assert closed.status_code == 409
    assert "período fechado" in closed.json()["detail"]

    open_id = _simulation(seed, occurred_at=datetime(2026, 10, 14, 12))
    alert_id = seed.alert(101, date(2026, 10, 12))
    seed.decision(alert_id, "archive")
    decided = client.delete(f"/ingestions/{open_id}")
    assert decided.status_code == 409
    assert "decisão de analista" in decided.json()["detail"]


def test_delete_non_simulation_is_refused(client, seed):
    ingestion_id = _simulation(seed, source="api")
    response = client.delete(f"/ingestions/{ingestion_id}")
    assert response.status_code == 409
    assert "Somente" in response.json()["detail"]
