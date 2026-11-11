"""GET /weeks e POST /replay/next-week."""

import json
from datetime import date

W1, W2, W3 = date(2023, 1, 2), date(2023, 1, 9), date(2023, 1, 16)


def test_processed_week_is_visible_without_release(client, seed):
    seed.batch(W1)
    assert client.get("/weeks").json() == {
        "current": "2023-01-02",
        "next_release": None,
        "items": [{"week": "2023-01-02", "alerts": 0, "pending": 0}],
    }


def test_empty_database_has_nothing_to_show_or_release(client):
    assert client.get("/weeks").json() == {"current": None, "next_release": None, "items": []}


def test_replay_compatibility_never_controls_visibility(client, seed):
    seed.batch(W1, released=True)
    seed.batch(W3)
    seed.batch(W2)
    assert client.get("/weeks").json()["current"] == "2023-01-16"
    client.post("/replay/next-week")
    assert client.get("/weeks").json()["next_release"] is None
    client.post("/replay/next-week")
    body = client.get("/weeks").json()
    assert (body["current"], body["next_release"]) == ("2023-01-16", None)
    assert client.post("/replay/next-week").status_code == 409


def test_lists_all_processed_weeks_from_newest_to_oldest(client, seed):
    seed.batch(W1, released=True)
    seed.batch(W2, released=True)
    seed.batch(W3)
    seed.alert(1, W1, status="new")
    seed.alert(2, W1, status="in_review")
    seed.alert(3, W1, status="archived")
    seed.alert(4, W1, status="reported")
    seed.alert(5, W3)
    body = client.get("/weeks").json()
    assert body["current"] == "2023-01-16"
    assert body["next_release"] is None
    assert body["items"] == [
        {"week": "2023-01-16", "alerts": 1, "pending": 1},
        {"week": "2023-01-09", "alerts": 0, "pending": 0},
        {"week": "2023-01-02", "alerts": 4, "pending": 2},
    ]


def test_replay_releases_oldest_and_counts_alerts(client, seed):
    seed.batch(W2)
    seed.batch(W1)
    seed.alert(1, W1)
    seed.alert(2, W1)
    seed.alert(3, W2)
    assert client.post("/replay/next-week", json={}).json() == {
        "week": "2023-01-02",
        "alerts_generated": 2,
    }
    assert client.post("/replay/next-week", json={}).json() == {
        "week": "2023-01-09",
        "alerts_generated": 1,
    }
    assert client.get("/weeks").json()["current"] == "2023-01-09"


def test_replay_skips_already_released_week(client, seed):
    seed.batch(W1, released=True)
    seed.batch(W2)
    assert client.post("/replay/next-week").json()["week"] == "2023-01-09"


def test_replay_records_audit_with_analyst(client, seed):
    seed.batch(W1)
    seed.alert(1, W1)
    client.post("/replay/next-week")
    row = seed.row("SELECT actor, action, entity, entity_id, details FROM audit_log")
    assert row["actor"] == "Analista local"
    assert (row["action"], row["entity"], row["entity_id"]) == (
        "replay",
        "week",
        "2023-01-02",
    )
    details = row["details"]
    details = json.loads(details) if isinstance(details, str) else details
    assert details == {"alerts": 1, "user_id": "local"}


def test_replay_without_processed_week_returns_409_without_audit(client, seed):
    seed.batch(W1, released=True)
    resp = client.post("/replay/next-week")
    assert resp.status_code == 409
    assert "worker" in resp.json()["detail"]
    assert seed.count("audit_log") == 0
