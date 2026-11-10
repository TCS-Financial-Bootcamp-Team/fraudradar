"""GET /monitoring."""

from datetime import date, timedelta

import pytest

from api.repositories.monitoring import SCORE_HISTOGRAM_BINS, clamp_rate, week_label

W1 = date(2023, 1, 2)


def _monitoring(client, week=W1) -> dict:
    resp = client.get("/monitoring", params={"week": week.isoformat()})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_empty_week_zeros_everything(client):
    body = _monitoring(client)
    assert body["week"] == "2023-01-02"
    ind = body["indicators"]
    assert ind["alerts"] == 0
    assert ind["reviewed"] == 0
    assert ind["reported"] == 0
    assert ind["alert_rate"] == 0.0
    assert ind["flagged_amount"] == 0.0
    assert ind["recall"] is None
    assert ind["typology_accuracy"] is None
    assert all(
        body[series] == [] for series in ("weeks", "typologies", "countries", "recall_series")
    )
    assert body["country_rates"] == body["payment_type_rates"] == []
    assert body["score_histogram"] == [{"name": b, "value": 0} for b in SCORE_HISTOGRAM_BINS]
    assert body["status_counts"] == {"pending": 0, "escalated": 0, "archived": 0, "reported": 0}


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
    [(0.4, 0.4), (1, 1.0), (1.7, 1.0), (-0.2, 0.0), ("0.4", None), (True, None), (None, None)],
)
def test_clamp_rate_accepts_only_number_between_0_and_1(val, expected):
    assert clamp_rate(val) == expected


def test_clamp_rate_rejects_non_finite():
    assert clamp_rate(float("nan")) is None
    assert clamp_rate(float("inf")) is None


def test_invalid_worker_metrics_do_not_crash_route(client, seed):
    seed.batch(W1, metrics={"recall": "alto", "typology_accuracy": 3, "country_rates": [1, 2]})
    body = _monitoring(client)
    assert body["indicators"]["recall"] is None
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


def test_recall_series_released_and_metrics_filtering(client, seed):
    # Semana 0: liberada com recall -> deve aparecer
    w0 = W1
    seed.batch(w0, metrics={"recall": 0.81}, released=True)

    # Semana 1: liberada SEM métricas (e.g. ingestão manual/CSV sem gabarito) -> omitida
    w1 = W1 + timedelta(weeks=1)
    seed.batch(w1, metrics={}, released=True)

    # Semana 2: NÃO liberada (released_at IS NULL), com recall -> omitida
    w2 = W1 + timedelta(weeks=2)
    seed.batch(w2, metrics={"recall": 0.90}, released=False)

    # Semana 3: liberada com recall -> deve aparecer
    w3 = W1 + timedelta(weeks=3)
    seed.batch(w3, metrics={"recall": 0.86}, released=True)

    # Semana 4: liberada com recall mas posterior à semana solicitada -> omitida
    w4 = W1 + timedelta(weeks=4)
    seed.batch(w4, metrics={"recall": 0.95}, released=True)

    body = _monitoring(client, week=w3)
    assert body["recall_series"] == [
        {"name": week_label(w0), "value": 0.81},
        {"name": week_label(w3), "value": 0.86},
    ]


def test_score_histogram_bins(client, seed):
    # Faixas:
    # "40": [<50) -> teste com score abaixo de 0.40 (0.35) e 0.45
    # "50": [50, 60) -> 0.50
    # "60": [60, 70) -> 0.60
    # "70": [70, 80) -> 0.70
    # "80": [80, 90) -> 0.80
    # "90": [90, 95) -> 0.90
    # "95": [95, 99.95) -> 0.95 e 0.9994
    # "100": [99.95, 100] -> 0.9995 e 1.0
    seed.alert(1, W1, score=0.35)  # abaixo de 0.40 -> bin 40
    seed.alert(2, W1, score=0.45)  # bin 40
    seed.alert(3, W1, score=0.50)  # bin 50
    seed.alert(4, W1, score=0.60)  # bin 60
    seed.alert(5, W1, score=0.70)  # bin 70
    seed.alert(6, W1, score=0.80)  # bin 80
    seed.alert(7, W1, score=0.90)  # bin 90
    seed.alert(8, W1, score=0.95)  # bin 95
    seed.alert(9, W1, score=0.9994)  # bin 95
    seed.alert(10, W1, score=0.9995)  # borda 99.95 -> bin 100
    seed.alert(11, W1, score=1.0)  # bin 100

    # Alerta de outra semana não deve interferir
    seed.alert(12, W1 + timedelta(weeks=1), score=0.9995)

    body = _monitoring(client, week=W1)
    assert body["score_histogram"] == [
        {"name": "40", "value": 2},
        {"name": "50", "value": 1},
        {"name": "60", "value": 1},
        {"name": "70", "value": 1},
        {"name": "80", "value": 1},
        {"name": "90", "value": 1},
        {"name": "95", "value": 2},
        {"name": "100", "value": 2},
    ]


def test_status_counts(client, seed):
    seed.alert(1, W1, status="new")  # pending
    seed.alert(2, W1, status="in_review")  # pending
    seed.alert(3, W1, status="escalated")  # escalated
    seed.alert(4, W1, status="archived")  # archived
    seed.alert(5, W1, status="reported")  # reported
    seed.alert(6, W1, status="reported")  # reported
    # Outra semana
    seed.alert(7, W1 + timedelta(weeks=1), status="new")

    body = _monitoring(client, week=W1)
    assert body["status_counts"] == {
        "pending": 2,
        "escalated": 1,
        "archived": 1,
        "reported": 2,
    }


def test_indicators_recall_null_when_batch_has_no_recall(client, seed):
    # Lote sem recall
    seed.batch(W1, metrics={})
    body = _monitoring(client, week=W1)
    assert body["indicators"]["recall"] is None
    assert body["indicators"]["typology_accuracy"] is None

    # Lote apenas com typology_accuracy
    w2 = W1 + timedelta(weeks=1)
    seed.batch(w2, metrics={"typology_accuracy": 0.88})
    body2 = _monitoring(client, week=w2)
    assert body2["indicators"]["recall"] is None
    assert body2["indicators"]["typology_accuracy"] == 0.88
