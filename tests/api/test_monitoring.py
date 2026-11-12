"""GET /monitoring."""

from datetime import date, timedelta

import pytest

from api.repositories.monitoring import clamp_rate, week_label

W1 = date(2023, 1, 2)


def _monitoring(client, week=W1) -> dict:
    resp = client.get("/monitoring", params={"week": week.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_empty_week_zeros_everything(client):
    body = _monitoring(client)
    assert body["week"] == "2023-01-02"
    assert set(body["indicators"].values()) == {0}
    assert all(body[series] == [] for series in ("weeks", "typologies", "countries"))
    assert body["country_rates"] == body["payment_type_rates"] == []


def test_week_counts(client, seed):
    seed.alert(1, W1, status="new", total_amount=100)
    seed.alert(2, W1, status="in_review", total_amount=50.5)
    seed.alert(3, W1, status="archived")
    seed.alert(4, W1, status="escalated")
    reported_alert = seed.alert(5, W1, status="reported")
    draft_only = seed.alert(6, W1, status="reported")
    seed.alert(7, W1 + timedelta(days=7), status="archived", total_amount=999)
    seed.report(reported_alert, seed.decision(reported_alert), approved_by="Ana")
    seed.report(draft_only, seed.decision(draft_only))
    indicators = _monitoring(client)["indicators"]
    assert indicators["alerts"] == 6
    assert indicators["reviewed"] == 4  # new e in_review ainda são pendentes
    assert indicators["reported"] == 1  # só a comunicação aprovada conta
    assert indicators["flagged_amount"] == 100 + 50.5 + 4 * 1000


def test_approved_report_counts_once(client, seed):
    aid = seed.alert(1, W1, status="reported")
    did = seed.decision(aid)
    seed.report(aid, did, approved_by="Ana")
    seed.report(aid, did, approved_by="Bia")
    assert _monitoring(client)["indicators"]["reported"] == 1


def test_alert_rate_and_batch_metrics(client, seed):
    seed.batch(W1, active_accounts=200, metrics={"recall": 0.79, "typology_accuracy": 0.5})
    for acc in range(1, 6):
        seed.alert(acc, W1)
    indicators = _monitoring(client)["indicators"]
    assert indicators["alert_rate"] == pytest.approx(5 / 200)
    assert indicators["recall"] == 0.79
    assert indicators["typology_accuracy"] == 0.5


@pytest.mark.parametrize(
    ("active_accounts", "alerts", "expected"),
    [(0, 2, 0.0), (1, 3, 1.0)],
    ids=["no-active-accounts", "more-alerts-than-accounts"],
)
def test_alert_rate_at_bounds(client, seed, active_accounts, alerts, expected):
    seed.batch(W1, active_accounts=active_accounts)
    for acc in range(alerts):
        seed.alert(acc + 1, W1)
    assert _monitoring(client)["indicators"]["alert_rate"] == expected


@pytest.mark.parametrize(
    ("val", "expected"),
    [(0.4, 0.4), (1, 1.0), (1.7, 1.0), (-0.2, 0.0), ("0.4", 0.0), (True, 0.0), (None, 0.0)],
)
def test_clamp_rate_accepts_only_number_between_0_and_1(val, expected):
    assert clamp_rate(val) == expected


def test_clamp_rate_rejects_non_finite():
    assert clamp_rate(float("nan")) == 0.0
    assert clamp_rate(float("inf")) == 0.0


def test_invalid_worker_metrics_do_not_crash_route(client, seed):
    seed.batch(W1, metrics={"recall": "alto", "typology_accuracy": 3, "country_rates": [1, 2]})
    body = _monitoring(client)
    assert body["indicators"]["recall"] == 0.0
    assert body["indicators"]["typology_accuracy"] == 1.0
    assert body["country_rates"] == []


def test_rates_by_country_and_payment_type_sorted(client, seed):
    seed.batch(
        W1,
        metrics={
            "country_rates": {"UK": 0.001, "UAE": 0.02, "Mexico": "x", "Turkey": 0.02},
            "payment_type_rates": {"Cash Deposit": 0.03, "ACH": 0.002},
        },
    )
    body = _monitoring(client)
    assert body["country_rates"] == [
        {"name": "Turkey", "value": 0.02},
        {"name": "UAE", "value": 0.02},
        {"name": "UK", "value": 0.001},
    ]
    assert [s["name"] for s in body["payment_type_rates"]] == ["Cash Deposit", "ACH"]


def test_weeks_series_up_to_requested_week(client, seed):
    weeks = [W1 + timedelta(weeks=i) for i in range(14)]
    for w in weeks:
        seed.batch(w)
    seed.alert(1, weeks[12])
    seed.alert(2, weeks[12])
    seed.alert(3, weeks[13])
    series = _monitoring(client, weeks[12])["weeks"]
    assert len(series) == 12  # a 13ª semana para trás e a 14ª (depois da pedida) ficam fora
    assert series[0]["name"] == week_label(weeks[1])
    assert series[-1] == {"name": week_label(weeks[12]), "value": 2}
    assert series[-2]["value"] == 0


def test_week_label_in_front_format():
    assert week_label(date(2023, 1, 2)) == "02 jan"
    assert week_label(date(2022, 9, 12)) == "12 set"


def test_distribution_by_typology_and_country(client, seed):
    seed.alert(1, W1, typology="Fan-out", countries=("UK", "UAE"))
    seed.alert(2, W1, typology="Fan-out", countries=("UAE",))
    seed.alert(3, W1, typology=None, countries=())
    seed.alert(4, W1 + timedelta(days=7), typology="Ciclo", countries=("UK",))
    body = _monitoring(client)
    assert body["typologies"] == [
        {"name": "Fan-out", "value": 2},
        {"name": "Indefinida", "value": 1},
    ]
    assert body["countries"] == [
        {"name": "Indefinido", "value": 1},
        {"name": "UAE", "value": 1},
        {"name": "UK", "value": 1},
    ]


def test_midweek_date_normalizes_to_monday(client, seed):
    seed.alert(1, W1)
    assert _monitoring(client, W1 + timedelta(days=3))["indicators"]["alerts"] == 1


# REGRESSION_TESTS_MONITORING_DASHBOARD_3365


def test_dashboard_new_fields_empty_week(client):
    """Uma semana vazia precisa manter o contrato do frontend."""
    body = _monitoring(client)

    assert body["recall_series"] == []
    assert len(body["score_histogram"]) == 8

    assert sum(
        point["value"]
        for point in body["score_histogram"]
    ) == 0

    assert body["status_counts"] == {
        "pending": 0,
        "escalated": 0,
        "archived": 0,
        "reported": 0,
    }


def test_dashboard_new_fields_with_real_database_queries(client, seed, db):
    """Validar recall, oito bins de score e status internos."""
    from sqlalchemy import text

    seed.batch(
        W1,
        active_accounts=100,
        metrics={"recall": 0.88},
    )

    statuses = (
        "new",
        "in_review",
        "escalated",
        "archived",
        "reported",
        "new",
        "new",
        "new",
    )

    scores = (
        0.45,
        0.55,
        0.65,
        0.75,
        0.85,
        0.925,
        0.975,
        0.9999,
    )

    for account, status in enumerate(statuses, start=1):
        seed.alert(account, W1, status=status)

    with db.begin() as conn:
        conn.execute(
            text(
                "UPDATE weekly_batches "
                "SET released_at = now() "
                "WHERE week = :week"
            ),
            {"week": W1},
        )

        for account, score in enumerate(scores, start=1):
            conn.execute(
                text(
                    "UPDATE alerts SET score = :score "
                    "WHERE week = :week AND account = :account"
                ),
                {
                    "week": W1,
                    "account": account,
                    "score": score,
                },
            )

    body = _monitoring(client)

    assert body["indicators"]["alerts"] == 8

    assert body["recall_series"] == [
        {"name": week_label(W1), "value": 0.88}
    ]

    assert [item["name"] for item in body["score_histogram"]] == [
        "40", "50", "60", "70", "80", "90", "95", "100"
    ]

    assert [item["value"] for item in body["score_histogram"]] == [
        1, 1, 1, 1, 1, 1, 1, 1
    ]

    assert body["status_counts"] == {
        "pending": 5,
        "escalated": 1,
        "archived": 1,
        "reported": 1,
    }

    assert sum(body["status_counts"].values()) == 8
