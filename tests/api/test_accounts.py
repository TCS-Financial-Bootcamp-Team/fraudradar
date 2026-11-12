"""GET /accounts/suspicious e histórico semanal de uma conta."""

from datetime import date

W1 = date(2026, 10, 5)
W2 = date(2026, 10, 12)


def test_suspicious_accounts_aggregates_and_orders_by_max_score_then_latest_position(client, seed):
    old = seed.alert(101, W1, score=0.95, position=1, total_amount=100)
    latest = seed.alert(
        101,
        W2,
        score=0.70,
        position=2,
        status="archived",
        total_amount=250,
        countries=("BR",),
    )
    seed.alert(202, W2, score=0.95, position=1, total_amount=400, countries=("PT",))

    body = client.get("/accounts/suspicious").json()

    assert body["total"] == 2
    assert [item["account"] for item in body["items"]] == ["202", "101"]
    account = body["items"][1]
    assert account == {
        "account": "101",
        "max_score": 95.0,
        "latest_score": 70.0,
        "alert_weeks": 2,
        "first_week": W1.isoformat(),
        "last_week": W2.isoformat(),
        "total_flagged_amount": 350.0,
        "country": "BR",
        "status": "archived",
        "latest_alert_id": str(latest),
    }
    history = client.get("/accounts/101/alerts").json()["items"]
    assert [item["id"] for item in history] == [str(latest), str(old)]


def test_suspicious_accounts_filters_status_period_and_search(client, seed):
    seed.alert(101, W1, status="new")
    seed.alert(101, W2, status="archived")
    seed.alert(202, W2, status="new")

    response = client.get(
        "/accounts/suspicious",
        params={"from": W2.isoformat(), "status": "archived", "search": "10"},
    )

    assert response.status_code == 200
    assert [item["account"] for item in response.json()["items"]] == ["101"]


def test_status_filter_uses_the_latest_alert_in_the_selected_period(client, seed):
    seed.alert(101, W1, status="new")
    seed.alert(101, W2, status="archived")
    seed.alert(202, W2, status="new")

    body = client.get("/accounts/suspicious", params={"status": "pending"}).json()

    assert [item["account"] for item in body["items"]] == ["202"]
