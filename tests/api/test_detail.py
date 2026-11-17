"""GET /alerts/{id}: contribuições, regras, movimentações e parecer."""

from datetime import date, datetime, timedelta

WEEK = date(2023, 1, 2)
START = datetime(2023, 1, 2, 0, 0)
END = START + timedelta(days=7)
ACCOUNT = 100


def _detail(client, alert_id) -> dict:
    r = client.get(f"/alerts/{alert_id}")
    assert r.status_code == 200, r.text
    return r.json()


def test_nonexistent_alert_returns_404(client):
    assert client.get("/alerts/999").status_code == 404


def test_invalid_id_returns_422(client):
    assert client.get("/alerts/abc").status_code == 422


def test_alert_base_fields(client, seed):
    a = seed.alert(ACCOUNT, WEEK, score=0.5, status="escalated")
    d = _detail(client, a)
    assert (d["id"], d["account"], d["score"], d["status"]) == (
        str(a),
        "100",
        50.0,
        "escalated",
    )


def test_without_evidence_or_assessment(client, seed):
    d = _detail(client, seed.alert(ACCOUNT, WEEK))
    assert d["contributions"] == []
    assert d["rules"] == []
    assert d["movements"] == []
    assert d["assessment"] is None


# --- contribuições ---------------------------------------------------------------------------


def test_contributions_discard_negatives_and_normalize_by_positives(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(a, contributions={"x": 3.0, "y": 1.0, "z": -5.0, "w": 0.0})
    cs = _detail(client, a)["contributions"]
    # 3/4 e 1/4: os negativos e o zero não entram no denominador.
    assert cs == [{"name": "x", "value": 75.0}, {"name": "y", "value": 25.0}]


def test_contributions_keep_top_6_but_percentage_is_over_all(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    # 8 positivas: 8,7,...,1 (soma 36). Top 6 = 8..3.
    seed.evidence(a, contributions={f"f{i}": float(i) for i in range(1, 9)})
    cs = _detail(client, a)["contributions"]
    assert [c["name"] for c in cs] == ["f8", "f7", "f6", "f5", "f4", "f3"]
    assert cs[0]["value"] == round(8 / 36 * 100, 1)
    assert sum(c["value"] for c in cs) < 100


def test_contributions_round_to_1_decimal_place(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(a, contributions={"a": 1.0, "b": 2.0})
    cs = _detail(client, a)["contributions"]
    assert [c["value"] for c in cs] == [66.7, 33.3]


def test_contributions_use_label_and_fall_back_to_feature_name(client, seed, monkeypatch):
    from fraudradar import features

    # FEATURE_LABELS ainda está vazio no pacote; o teste não depende do conteúdo real.
    monkeypatch.setitem(features.FEATURE_LABELS, "labeled_feature", "Rótulo bonito")
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(a, contributions={"labeled_feature": 2.0, "unlabeled_feature": 1.0})
    names = [c["name"] for c in _detail(client, a)["contributions"]]
    assert names == ["Rótulo bonito", "unlabeled_feature"]


def test_contributions_ignore_non_numeric_values(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(a, contributions={"a": 1.0, "b": "2", "c": True, "d": None})
    assert _detail(client, a)["contributions"] == [{"name": "a", "value": 100.0}]


def test_contributions_with_no_positives_return_empty_list(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(a, contributions={"a": -1.0, "b": 0.0})
    assert _detail(client, a)["contributions"] == []


# --- regras ----------------------------------------------------------------------------------


def test_rules_preserve_order_and_ignore_malformed(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.evidence(
        a,
        rules=[
            {"code": "R-002", "description": "Segunda", "detail": {"x": 1}},
            "texto solto",
            {"code": "R-X"},
            {"description": "sem código"},
            {"code": 3, "description": "código numérico"},
            {"code": "R-Y", "description": None},
            {"code": "R-001", "description": "Primeira"},
        ],
    )
    assert _detail(client, a)["rules"] == [
        {"code": "R-002", "description": "Segunda"},
        {"code": "R-001", "description": "Primeira"},
    ]


# --- movimentações ---------------------------------------------------------------------------


def test_movement_maps_fields(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    t = seed.transaction(
        ACCOUNT,
        200,
        datetime(2023, 1, 3, 10, 30, 5),
        55.5,
        currency="Euro",
        payment_type="Cash Deposit",
    )
    assert _detail(client, a)["movements"] == [
        {
            "id": str(t),
            "date": "2023-01-03T10:30:05",
            "sender": "100",
            "receiver": "200",
            "amount": 55.5,
            "currency": "GBP",  # o valor do SAML-D é sempre em libras
            "payment_type": "Cash Deposit",
            "payment_currency": "Euro",
        }
    ]


def test_movements_include_sent_and_received_sorted(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    received = seed.transaction(300, ACCOUNT, START + timedelta(hours=1))
    sent_late = seed.transaction(ACCOUNT, 200, START + timedelta(hours=5))
    sent_early = seed.transaction(ACCOUNT, 201, START + timedelta(hours=1))  # empata com received
    seed.transaction(300, 301, START + timedelta(hours=2))  # alheia
    ids = [m["id"] for m in _detail(client, a)["movements"]]
    # empate de occurred_at desempata por id
    assert ids == [str(received), str(sent_early), str(sent_late)]


def test_self_transfer_appears_once(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    t = seed.transaction(ACCOUNT, ACCOUNT, START + timedelta(days=1))
    assert [m["id"] for m in _detail(client, a)["movements"]] == [str(t)]


def test_window_includes_monday_00h_and_excludes_next_monday_00h(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, START - timedelta(seconds=1))
    inside_start = seed.transaction(ACCOUNT, 200, START)
    inside_end = seed.transaction(200, ACCOUNT, END - timedelta(seconds=1))
    seed.transaction(ACCOUNT, 200, END)
    seed.transaction(200, ACCOUNT, END)
    ids = [m["id"] for m in _detail(client, a)["movements"]]
    assert ids == [str(inside_start), str(inside_end)]


def test_movements_above_200_keep_largest_in_chronological_order(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    amounts = [100 + (i * 37) % 205 for i in range(205)]  # permutação: as 5 menores se espalham
    ids = []
    for i, amount in enumerate(amounts):
        sender, receiver = (ACCOUNT, 200) if i % 2 else (200, ACCOUNT)
        ids.append(seed.transaction(sender, receiver, START + timedelta(minutes=i), amount))
    movs = _detail(client, a)["movements"]
    smallest = {ids[i] for i, amount in enumerate(amounts) if amount < 105}
    assert len(smallest) == 5 and smallest != set(ids[-5:])  # cortar por data daria outro resultado
    assert [m["id"] for m in movs] == [str(i) for i in ids if i not in smallest]


# --- parecer ---------------------------------------------------------------------------------


def test_latest_assessment_wins(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.assessment(a, "novo", created_at=datetime(2023, 1, 5, 12, 0))
    seed.assessment(a, "antigo", created_at=datetime(2023, 1, 4, 12, 0))
    assert _detail(client, a)["assessment"]["content"] == "novo"
    assert _detail(client, a)["assessment"]["summary"] == "novo"


def test_stored_assessment_derives_summary_and_filters_uncited_sources(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.assessment(
        a,
        "## Resumo\nConfira as contrapartes.\n\n## Fundamentação jurídica\nDeveres [F2].",
        sources=[
            {"title": "[F1] Lei 9.613/1998, Art. 10", "excerpt": "Fonte não citada."},
            {"title": "[F2] Lei 9.613/1998, Art. 11", "excerpt": "Fonte citada."},
        ],
    )
    assessment = _detail(client, a)["assessment"]
    assert assessment["summary"] == "Confira as contrapartes."
    assert [source["title"] for source in assessment["sources"]] == ["[F2] Lei 9.613/1998, Art. 11"]


def test_assessment_tied_on_time_breaks_tie_by_highest_id(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    ts = datetime(2023, 1, 5, 12, 0)
    seed.assessment(a, "primeiro", created_at=ts)
    seed.assessment(a, "segundo", created_at=ts)
    assert _detail(client, a)["assessment"]["content"] == "segundo"


def test_assessment_ignores_malformed_sources(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.assessment(
        a,
        "texto [1]",
        sources=[
            {"title": "[1] Lei", "excerpt": "art. 1"},
            {"title": "sem trecho"},
            {"excerpt": "sem título"},
            {"title": 1, "excerpt": "x"},
            "solta",
            {"title": "[2] Circular", "excerpt": "art. 2"},
        ],
    )
    assert _detail(client, a)["assessment"] == {
        "content": "texto [1]",
        "summary": "texto [1]",
        "sources": [
            {"title": "[1] Lei", "excerpt": "art. 1"},
        ],
    }


def test_assessment_from_another_alert_does_not_leak(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    b = seed.alert(101, WEEK, position=2)
    seed.assessment(b, "do outro")
    assert _detail(client, a)["assessment"] is None
