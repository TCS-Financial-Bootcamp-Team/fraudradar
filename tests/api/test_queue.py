"""GET /alerts: filtros, ordenação, paginação e lista de países."""

from datetime import date

import pytest

WEEK = date(2023, 1, 2)  # segunda-feira
OTHER_WEEK = date(2023, 1, 9)


def _ids(resp) -> list[str]:
    return [a["id"] for a in resp.json()["items"]]


def test_week_without_alerts_returns_empty_queue(client):
    r = client.get("/alerts", params={"week": WEEK.isoformat()})
    assert r.status_code == 200
    assert r.json() == {"items": [], "total": 0, "countries": []}


def test_week_is_required(client):
    assert client.get("/alerts").status_code == 422


def test_wednesday_finds_monday_alerts(client, seed):
    a = seed.alert(1, WEEK)
    r = client.get("/alerts", params={"week": "2023-01-04"})
    assert _ids(r) == [str(a)]


def test_weeks_are_isolated(client, seed):
    a = seed.alert(1, WEEK)
    seed.alert(2, OTHER_WEEK)
    r = client.get("/alerts", params={"week": WEEK.isoformat()})
    assert _ids(r) == [str(a)]
    assert r.json()["total"] == 1


def test_item_matches_front_contract(client, seed):
    a = seed.alert(
        77, WEEK, score=0.873, countries=("Mexico", "UK"), typology=None, total_amount=12.5,
        transaction_count=4,
    )  # fmt: skip
    item = client.get("/alerts", params={"week": WEEK.isoformat()}).json()["items"][0]
    assert item == {
        "id": str(a),
        "account": "77",
        "week": WEEK.isoformat(),
        "country": "Mexico",
        "typology": "Indefinida",
        "score": 87.3,
        "amount": 12.5,
        "transaction_count": 4,
        "status": "pending",
        "queue_position": 1,
        "origin": "model",
    }


@pytest.mark.parametrize(
    ("filter_status", "expected_db_statuses"),
    [
        ("pending", {"new", "in_review"}),
        ("escalated", {"escalated"}),
        ("archived", {"archived"}),
        ("reported", {"reported"}),
    ],
)
def test_status_filter_maps_to_database(client, seed, filter_status, expected_db_statuses):
    by_status = {
        s: seed.alert(i + 1, WEEK, position=i + 1)
        for i, s in enumerate(["new", "in_review", "escalated", "archived", "reported"])
    }
    with seed.engine.begin() as conn:
        for s, aid in by_status.items():
            conn.exec_driver_sql("UPDATE alerts SET status = %s WHERE id = %s", (s, aid))
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "status": filter_status})
    assert sorted(_ids(r)) == sorted(str(by_status[s]) for s in expected_db_statuses)
    assert r.json()["total"] == len(expected_db_statuses)


def test_invalid_status_returns_422(client):
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "status": "new"})
    assert r.status_code == 422


def test_country_filters_by_containment_in_multicountry_alert(client, seed):
    uk_only = seed.alert(1, WEEK, countries=("UK",), position=1)
    multi = seed.alert(2, WEEK, countries=("Mexico", "Turkey"), position=2)
    seed.alert(3, WEEK, countries=("Mexico",), position=3)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "country": "Turkey"})
    assert _ids(r) == [str(multi)]
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "country": "UK"})
    assert _ids(r) == [str(uk_only)]


def test_empty_or_long_country_returns_422(client):
    base = {"week": WEEK.isoformat()}
    assert client.get("/alerts", params={**base, "country": ""}).status_code == 422
    assert client.get("/alerts", params={**base, "country": "x" * 81}).status_code == 422


def test_countries_ignores_status_and_country_but_respects_week(client, seed):
    seed.alert(1, WEEK, countries=("UK", "Mexico"), position=1, status="archived")
    seed.alert(2, WEEK, countries=("Turkey",), position=2)
    seed.alert(3, OTHER_WEEK, countries=("Japan",))
    r = client.get(
        "/alerts",
        params={"week": WEEK.isoformat(), "status": "pending", "country": "Turkey"},
    )
    assert r.json()["countries"] == ["Mexico", "Turkey", "UK"]
    assert r.json()["total"] == 1


def test_sort_score_desc_breaks_ties_by_position_and_id(client, seed):
    low = seed.alert(1, WEEK, score=0.5, position=1)
    tie_pos2 = seed.alert(2, WEEK, score=0.9, position=2)
    tie_pos1 = seed.alert(3, WEEK, score=0.9, position=1)
    equal_a = seed.alert(4, WEEK, score=0.7, position=5)
    equal_b = seed.alert(5, WEEK, score=0.7, position=5)
    r = client.get("/alerts", params={"week": WEEK.isoformat()})
    assert _ids(r) == [
        str(tie_pos1),
        str(tie_pos2),
        str(equal_a),
        str(equal_b),
        str(low),
    ]


def test_sort_queue_uses_position_and_breaks_ties_by_id(client, seed):
    c = seed.alert(1, WEEK, score=0.9, position=3)
    a = seed.alert(2, WEEK, score=0.1, position=1)
    b = seed.alert(3, WEEK, score=0.5, position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "sort": "queue"})
    assert _ids(r) == [str(a), str(b), str(c)]


def test_invalid_sort_returns_422(client):
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "sort": "amount"})
    assert r.status_code == 422


def test_paging_total_and_page_past_end(client, seed):
    ids = [seed.alert(i, WEEK, score=1 - i / 100, position=i) for i in range(1, 6)]
    base = {"week": WEEK.isoformat(), "size": 2}
    p1 = client.get("/alerts", params={**base, "page": 1}).json()
    p2 = client.get("/alerts", params={**base, "page": 2}).json()
    p3 = client.get("/alerts", params={**base, "page": 3}).json()
    p4 = client.get("/alerts", params={**base, "page": 4}).json()
    assert [a["id"] for a in p1["items"]] == [str(ids[0]), str(ids[1])]
    assert [a["id"] for a in p2["items"]] == [str(ids[2]), str(ids[3])]
    assert [a["id"] for a in p3["items"]] == [str(ids[4])]
    assert p4["items"] == []
    assert {p["total"] for p in (p1, p2, p3, p4)} == {5}


def test_default_size_is_10(client, seed):
    for i in range(1, 13):
        seed.alert(i, WEEK, position=i)
    r = client.get("/alerts", params={"week": WEEK.isoformat()}).json()
    assert len(r["items"]) == 10
    assert r["total"] == 12


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": 10_001},
        {"page": 922337203685477582},
        {"size": 0},
        {"size": 101},
    ],
    ids=["page0", "page10001", "page-overflows-offset", "size0", "size101"],
)
def test_invalid_paging_returns_422(client, params):
    r = client.get("/alerts", params={"week": WEEK.isoformat(), **params})
    assert r.status_code == 422


def test_search_matches_by_id(client, seed):
    a1 = seed.alert(8001, WEEK, position=1)
    seed.alert(9002, WEEK, position=2)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": str(a1)})
    assert r.status_code == 200
    assert _ids(r) == [str(a1)]
    assert r.json()["total"] == 1


def test_search_matches_by_account_prefix(client, seed):
    a1 = seed.alert(987654, WEEK, position=1)
    a2 = seed.alert(987123, WEEK, position=2)
    seed.alert(123456, WEEK, position=3)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "987"})
    assert r.status_code == 200
    assert sorted(_ids(r)) == sorted([str(a1), str(a2)])
    assert r.json()["total"] == 2


def test_search_no_match_returns_empty_with_zero_total(client, seed):
    seed.alert(123456, WEEK, countries=("Brazil",), position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "999999"})
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["countries"] == ["Brazil"]


def test_search_combined_with_status_filter(client, seed):
    a1 = seed.alert(5551, WEEK, status="archived", position=1)
    seed.alert(5552, WEEK, status="new", position=2)
    r = client.get(
        "/alerts",
        params={"week": WEEK.isoformat(), "search": "555", "status": "archived"},
    )
    assert r.status_code == 200
    assert _ids(r) == [str(a1)]
    assert r.json()["total"] == 1


def test_search_validation_too_long_or_empty_returns_422(client):
    base = {"week": WEEK.isoformat()}
    assert client.get("/alerts", params={**base, "search": ""}).status_code == 422
    assert client.get("/alerts", params={**base, "search": "1" * 41}).status_code == 422


def test_search_trimmed_matches(client, seed):
    a = seed.alert(987654, WEEK, position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "  987  "})
    assert r.status_code == 200
    assert _ids(r) == [str(a)]


def test_search_non_digits_matches_account_prefix(client, seed):
    seed.alert(123456, WEEK, position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "nonexistent"})
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_search_40_digit_numeric_returns_empty_200(client, seed):
    seed.alert(123456, WEEK, position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "9" * 40})
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0


def test_search_non_ascii_digit_returns_empty_200(client, seed):
    seed.alert(123456, WEEK, position=1)
    r = client.get("/alerts", params={"week": WEEK.isoformat(), "search": "²"})
    assert r.status_code == 200
    assert r.json()["items"] == []
    assert r.json()["total"] == 0
