"""GET /alerts/{id}/graph: vizinhança de 2 saltos agregada por par."""

from datetime import date, datetime, timedelta

WEEK = date(2023, 1, 2)
START = datetime(2023, 1, 2, 0, 0)
END = START + timedelta(days=7)
ACCOUNT = 100
DAY = START + timedelta(days=1)


def _graph(client, alert_id) -> dict:
    r = client.get(f"/alerts/{alert_id}/graph")
    assert r.status_code == 200, r.text
    return r.json()


def _edges(g) -> dict[str, float]:
    return {e["id"]: e["amount"] for e in g["edges"]}


def test_nonexistent_alert_returns_404(client):
    assert client.get("/alerts/999/graph").status_code == 404


def test_account_without_transactions_in_week_has_only_central_node(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, END)  # fora da semana
    assert _graph(client, a) == {
        "nodes": [{"id": "100", "label": "100", "central": True}],
        "edges": [],
    }


def test_hop_1_nodes_and_edges(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 300, DAY, 10)
    seed.transaction(200, ACCOUNT, DAY, 20)
    g = _graph(client, a)
    assert g["nodes"] == [
        {"id": "100", "label": "100", "central": True},
        {"id": "200", "label": "200", "central": False},
        {"id": "300", "label": "300", "central": False},
    ]
    assert g["edges"] == [
        {"id": "200-100", "source": "200", "target": "100", "amount": 20.0},
        {"id": "100-300", "source": "100", "target": "300", "amount": 10.0},
    ]


def test_repeated_pairs_are_summed_and_directions_stay_separate(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, DAY, 10.5)
    seed.transaction(ACCOUNT, 200, DAY + timedelta(hours=1), 4.5)
    seed.transaction(200, ACCOUNT, DAY, 7)
    assert _edges(_graph(client, a)) == {"100-200": 15.0, "200-100": 7.0}


def test_transactions_outside_week_are_excluded_in_both_hops(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, DAY, 10)
    seed.transaction(ACCOUNT, 200, END, 1000)  # limite superior excluído
    seed.transaction(ACCOUNT, 200, START - timedelta(seconds=1), 1000)
    seed.transaction(200, 400, END, 1000)
    seed.transaction(200, 400, START - timedelta(seconds=1), 1000)
    g = _graph(client, a)
    assert _edges(g) == {"100-200": 10.0}
    assert [n["id"] for n in g["nodes"]] == ["100", "200"]


def test_lower_bound_of_week_is_included(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, START, 10)
    assert _edges(_graph(client, a)) == {"100-200": 10.0}


def test_hop_2_fetches_neighbor_edges_in_both_directions(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, DAY, 50)
    seed.transaction(200, 400, DAY, 5)  # vizinha envia
    seed.transaction(500, 200, DAY, 6)  # vizinha recebe
    seed.transaction(600, 700, DAY, 99)  # sem relação
    g = _graph(client, a)
    assert _edges(g) == {"100-200": 50.0, "200-400": 5.0, "500-200": 6.0}
    assert [n["id"] for n in g["nodes"]] == ["100", "200", "400", "500"]
    assert [n["central"] for n in g["nodes"]] == [True, False, False, False]


def test_hop_2_excludes_edges_touching_central_and_does_not_repeat_hop_1(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, DAY, 10)
    seed.transaction(300, ACCOUNT, DAY, 10)
    seed.transaction(200, 300, DAY, 3)  # entre duas vizinhas: aparece uma vez só
    seed.transaction(200, ACCOUNT, DAY, 2)  # toca a conta: é do salto 1
    g = _graph(client, a)
    assert [x["id"] for x in g["edges"]].count("200-300") == 1
    assert _edges(g) == {
        "100-200": 10.0,
        "300-100": 10.0,
        "200-300": 3.0,
        "200-100": 2.0,
    }


def test_hop_1_keeps_top_30(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    for i in range(35):
        seed.transaction(ACCOUNT, 1000 + i, DAY, 100 + i)  # contas 1000..1034
    g = _graph(client, a)
    targets = {int(x["target"]) for x in g["edges"]}
    assert len(g["edges"]) == 30
    assert targets == set(range(1005, 1035))  # as 5 menores caem
    assert len(g["nodes"]) == 31


def test_hop_1_breaks_ties_by_source_and_target(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    for i in range(31):
        seed.transaction(ACCOUNT, 1000 + i, DAY, 10)  # todos iguais
    targets = {int(x["target"]) for x in _graph(client, a)["edges"]}
    assert targets == set(range(1000, 1030))  # cai o maior destino


def test_hop_2_keeps_top_30_without_affecting_hop_1(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, 200, DAY, 1)
    for i in range(35):
        seed.transaction(200, 2000 + i, DAY, 100 + i)  # contas 2000..2034
    g = _graph(client, a)
    assert len(g["edges"]) == 31  # 1 do salto 1 + 30 do salto 2
    assert "100-200" in _edges(g)
    targets2 = {int(x["target"]) for x in g["edges"] if x["source"] == "200"}
    assert targets2 == set(range(2005, 2035))


def test_hop_2_neighbors_come_only_from_top_30_hop_1_edges(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    for i in range(30):
        seed.transaction(ACCOUNT, 1000 + i, DAY, 100 + i)
    seed.transaction(ACCOUNT, 3000, DAY, 1)  # 31ª, menor: cortada
    seed.transaction(3000, 3001, DAY, 999)  # só chegaria por ela
    g = _graph(client, a)
    assert "3000-3001" not in _edges(g)
    assert "3000" not in {n["id"] for n in g["nodes"]}


def test_self_transfer_does_not_create_extra_node(client, seed):
    a = seed.alert(ACCOUNT, WEEK)
    seed.transaction(ACCOUNT, ACCOUNT, DAY, 10)
    g = _graph(client, a)
    assert [n["id"] for n in g["nodes"]] == ["100"]
    assert _edges(g) == {"100-100": 10.0}
