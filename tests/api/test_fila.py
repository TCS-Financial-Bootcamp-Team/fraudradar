"""GET /alertas: filtros, ordenação, paginação e lista de países."""

from datetime import date

import pytest

SEMANA = date(2023, 1, 2)  # segunda-feira
OUTRA = date(2023, 1, 9)


def _ids(resposta) -> list[str]:
    return [a["id"] for a in resposta.json()["itens"]]


def test_semana_sem_alertas_devolve_fila_vazia(cliente):
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat()})
    assert r.status_code == 200
    assert r.json() == {"itens": [], "total": 0, "paises": []}


def test_semana_e_obrigatoria(cliente):
    assert cliente.get("/alertas").status_code == 422


def test_quarta_acha_alertas_da_segunda(cliente, semente):
    a = semente.alerta(1, SEMANA)
    r = cliente.get("/alertas", params={"semana": "2023-01-04"})
    assert _ids(r) == [str(a)]


def test_semanas_sao_isoladas(cliente, semente):
    a = semente.alerta(1, SEMANA)
    semente.alerta(2, OUTRA)
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat()})
    assert _ids(r) == [str(a)]
    assert r.json()["total"] == 1


def test_item_segue_o_contrato_do_front(cliente, semente):
    a = semente.alerta(
        77, SEMANA, score=0.873, paises=("Mexico", "UK"), tipologia=None, valor_total=12.5,
        qtd_transacoes=4,
    )  # fmt: skip
    item = cliente.get("/alertas", params={"semana": SEMANA.isoformat()}).json()["itens"][0]
    assert item == {
        "id": str(a),
        "conta": "77",
        "semana": SEMANA.isoformat(),
        "pais": "Mexico",
        "tipologia": "Indefinida",
        "score": 87.3,
        "valor": 12.5,
        "transacoes": 4,
        "status": "pendente",
    }


@pytest.mark.parametrize(
    ("filtro", "esperados"),
    [
        ("pendente", {"novo", "em_analise"}),
        ("aprofundar", {"aprofundado"}),
        ("arquivado", {"arquivado"}),
        ("comunicar", {"comunicado"}),
    ],
)
def test_filtro_de_status_mapeia_para_o_banco(cliente, semente, filtro, esperados):
    por_status = {
        s: semente.alerta(i + 1, SEMANA, posicao=i + 1)
        for i, s in enumerate(["novo", "em_analise", "aprofundado", "arquivado", "comunicado"])
    }
    with semente.engine.begin() as conn:
        for s, aid in por_status.items():
            conn.exec_driver_sql("UPDATE alertas SET status = %s WHERE id = %s", (s, aid))
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "status": filtro})
    assert sorted(_ids(r)) == sorted(str(por_status[s]) for s in esperados)
    assert r.json()["total"] == len(esperados)


def test_status_invalido_da_422(cliente):
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "status": "novo"})
    assert r.status_code == 422


def test_pais_filtra_por_contencao_em_alerta_multipais(cliente, semente):
    so_uk = semente.alerta(1, SEMANA, paises=("UK",), posicao=1)
    multi = semente.alerta(2, SEMANA, paises=("Mexico", "Turkey"), posicao=2)
    semente.alerta(3, SEMANA, paises=("Mexico",), posicao=3)
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "pais": "Turkey"})
    assert _ids(r) == [str(multi)]
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "pais": "UK"})
    assert _ids(r) == [str(so_uk)]


def test_pais_vazio_ou_longo_da_422(cliente):
    base = {"semana": SEMANA.isoformat()}
    assert cliente.get("/alertas", params={**base, "pais": ""}).status_code == 422
    assert cliente.get("/alertas", params={**base, "pais": "x" * 81}).status_code == 422


def test_paises_ignora_status_e_pais_mas_respeita_a_semana(cliente, semente):
    semente.alerta(1, SEMANA, paises=("UK", "Mexico"), posicao=1, status="arquivado")
    semente.alerta(2, SEMANA, paises=("Turkey",), posicao=2)
    semente.alerta(3, OUTRA, paises=("Japan",))
    r = cliente.get(
        "/alertas", params={"semana": SEMANA.isoformat(), "status": "pendente", "pais": "Turkey"}
    )
    assert r.json()["paises"] == ["Mexico", "Turkey", "UK"]
    assert r.json()["total"] == 1


def test_ordenacao_score_desc_desempata_por_posicao_e_id(cliente, semente):
    baixo = semente.alerta(1, SEMANA, score=0.5, posicao=1)
    empate_pos2 = semente.alerta(2, SEMANA, score=0.9, posicao=2)
    empate_pos1 = semente.alerta(3, SEMANA, score=0.9, posicao=1)
    tudo_igual_a = semente.alerta(4, SEMANA, score=0.7, posicao=5)
    tudo_igual_b = semente.alerta(5, SEMANA, score=0.7, posicao=5)
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat()})
    assert _ids(r) == [
        str(empate_pos1),
        str(empate_pos2),
        str(tudo_igual_a),
        str(tudo_igual_b),
        str(baixo),
    ]


def test_ordenacao_fila_usa_posicao_e_desempata_por_id(cliente, semente):
    c = semente.alerta(1, SEMANA, score=0.9, posicao=3)
    a = semente.alerta(2, SEMANA, score=0.1, posicao=1)
    b = semente.alerta(3, SEMANA, score=0.5, posicao=1)
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "ordenar": "fila"})
    assert _ids(r) == [str(a), str(b), str(c)]


def test_ordenar_invalido_da_422(cliente):
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), "ordenar": "valor"})
    assert r.status_code == 422


def test_paginacao_total_e_pagina_alem_do_fim(cliente, semente):
    ids = [semente.alerta(i, SEMANA, score=1 - i / 100, posicao=i) for i in range(1, 6)]
    base = {"semana": SEMANA.isoformat(), "tamanho": 2}
    p1 = cliente.get("/alertas", params={**base, "pagina": 1}).json()
    p2 = cliente.get("/alertas", params={**base, "pagina": 2}).json()
    p3 = cliente.get("/alertas", params={**base, "pagina": 3}).json()
    p4 = cliente.get("/alertas", params={**base, "pagina": 4}).json()
    assert [a["id"] for a in p1["itens"]] == [str(ids[0]), str(ids[1])]
    assert [a["id"] for a in p2["itens"]] == [str(ids[2]), str(ids[3])]
    assert [a["id"] for a in p3["itens"]] == [str(ids[4])]
    assert p4["itens"] == []
    assert {p["total"] for p in (p1, p2, p3, p4)} == {5}


def test_tamanho_padrao_e_10(cliente, semente):
    for i in range(1, 13):
        semente.alerta(i, SEMANA, posicao=i)
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat()}).json()
    assert len(r["itens"]) == 10
    assert r["total"] == 12


@pytest.mark.parametrize(
    "params",
    [
        {"pagina": 0},
        {"pagina": 10_001},
        {"pagina": 922337203685477582},
        {"tamanho": 0},
        {"tamanho": 101},
    ],
    ids=["pagina0", "pagina10001", "pagina-estoura-offset", "tam0", "tam101"],
)
def test_paginacao_invalida_da_422(cliente, params):
    r = cliente.get("/alertas", params={"semana": SEMANA.isoformat(), **params})
    assert r.status_code == 422
