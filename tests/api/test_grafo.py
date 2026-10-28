"""GET /alertas/{id}/grafo: vizinhança de 2 saltos agregada por par."""

from datetime import date, datetime, timedelta

SEMANA = date(2023, 1, 2)
INICIO = datetime(2023, 1, 2, 0, 0)
FIM = INICIO + timedelta(days=7)
CONTA = 100
DIA = INICIO + timedelta(days=1)


def _grafo(cliente, alerta_id) -> dict:
    r = cliente.get(f"/alertas/{alerta_id}/grafo")
    assert r.status_code == 200, r.text
    return r.json()


def _arestas(g) -> dict[str, float]:
    return {a["id"]: a["valor"] for a in g["arestas"]}


def test_alerta_inexistente_da_404(cliente):
    assert cliente.get("/alertas/999/grafo").status_code == 404


def test_conta_sem_transacoes_na_semana_so_tem_o_no_central(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, FIM)  # fora da semana
    assert _grafo(cliente, a) == {
        "nos": [{"id": "100", "rotulo": "100", "central": True}],
        "arestas": [],
    }


def test_salto_1_nos_e_arestas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 300, DIA, 10)
    semente.transacao(200, CONTA, DIA, 20)
    g = _grafo(cliente, a)
    assert g["nos"] == [
        {"id": "100", "rotulo": "100", "central": True},
        {"id": "200", "rotulo": "200", "central": False},
        {"id": "300", "rotulo": "300", "central": False},
    ]
    assert g["arestas"] == [
        {"id": "200-100", "origem": "200", "destino": "100", "valor": 20.0},
        {"id": "100-300", "origem": "100", "destino": "300", "valor": 10.0},
    ]


def test_pares_repetidos_sao_somados_e_direcoes_ficam_separadas(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, DIA, 10.5)
    semente.transacao(CONTA, 200, DIA + timedelta(hours=1), 4.5)
    semente.transacao(200, CONTA, DIA, 7)
    assert _arestas(_grafo(cliente, a)) == {"100-200": 15.0, "200-100": 7.0}


def test_transacoes_fora_da_semana_ficam_de_fora_nos_dois_saltos(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, DIA, 10)
    semente.transacao(CONTA, 200, FIM, 1000)  # limite superior excluído
    semente.transacao(CONTA, 200, INICIO - timedelta(seconds=1), 1000)
    semente.transacao(200, 400, FIM, 1000)
    semente.transacao(200, 400, INICIO - timedelta(seconds=1), 1000)
    g = _grafo(cliente, a)
    assert _arestas(g) == {"100-200": 10.0}
    assert [n["id"] for n in g["nos"]] == ["100", "200"]


def test_limite_inferior_da_semana_e_incluido(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, INICIO, 10)
    assert _arestas(_grafo(cliente, a)) == {"100-200": 10.0}


def test_salto_2_pega_arestas_das_vizinhas_nos_dois_sentidos(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, DIA, 50)
    semente.transacao(200, 400, DIA, 5)  # vizinha envia
    semente.transacao(500, 200, DIA, 6)  # vizinha recebe
    semente.transacao(600, 700, DIA, 99)  # sem relação
    g = _grafo(cliente, a)
    assert _arestas(g) == {"100-200": 50.0, "200-400": 5.0, "500-200": 6.0}
    assert [n["id"] for n in g["nos"]] == ["100", "200", "400", "500"]
    assert [n["central"] for n in g["nos"]] == [True, False, False, False]


def test_salto_2_nao_inclui_arestas_que_tocam_a_conta_nem_repete_o_salto_1(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, DIA, 10)
    semente.transacao(300, CONTA, DIA, 10)
    semente.transacao(200, 300, DIA, 3)  # entre duas vizinhas: aparece uma vez só
    semente.transacao(200, CONTA, DIA, 2)  # toca a conta: é do salto 1
    g = _grafo(cliente, a)
    assert [x["id"] for x in g["arestas"]].count("200-300") == 1
    assert _arestas(g) == {"100-200": 10.0, "300-100": 10.0, "200-300": 3.0, "200-100": 2.0}


def test_salto_1_mantem_as_30_maiores(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    for i in range(35):
        semente.transacao(CONTA, 1000 + i, DIA, 100 + i)  # contas 1000..1034
    g = _grafo(cliente, a)
    destinos = {int(x["destino"]) for x in g["arestas"]}
    assert len(g["arestas"]) == 30
    assert destinos == set(range(1005, 1035))  # as 5 menores caem
    assert len(g["nos"]) == 31


def test_salto_1_desempata_por_origem_e_destino(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    for i in range(31):
        semente.transacao(CONTA, 1000 + i, DIA, 10)  # todos iguais
    destinos = {int(x["destino"]) for x in _grafo(cliente, a)["arestas"]}
    assert destinos == set(range(1000, 1030))  # cai o maior destino


def test_salto_2_mantem_as_30_maiores_sem_afetar_o_salto_1(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, 200, DIA, 1)
    for i in range(35):
        semente.transacao(200, 2000 + i, DIA, 100 + i)  # contas 2000..2034
    g = _grafo(cliente, a)
    assert len(g["arestas"]) == 31  # 1 do salto 1 + 30 do salto 2
    assert "100-200" in _arestas(g)
    destinos2 = {int(x["destino"]) for x in g["arestas"] if x["origem"] == "200"}
    assert destinos2 == set(range(2005, 2035))


def test_vizinhas_do_salto_2_vem_so_das_30_arestas_mantidas_do_salto_1(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    for i in range(30):
        semente.transacao(CONTA, 1000 + i, DIA, 100 + i)
    semente.transacao(CONTA, 3000, DIA, 1)  # 31ª, menor: cortada
    semente.transacao(3000, 3001, DIA, 999)  # só chegaria por ela
    g = _grafo(cliente, a)
    assert "3000-3001" not in _arestas(g)
    assert "3000" not in {n["id"] for n in g["nos"]}


def test_autotransferencia_nao_vira_no_extra(cliente, semente):
    a = semente.alerta(CONTA, SEMANA)
    semente.transacao(CONTA, CONTA, DIA, 10)
    g = _grafo(cliente, a)
    assert [n["id"] for n in g["nos"]] == ["100"]
    assert _arestas(g) == {"100-100": 10.0}
