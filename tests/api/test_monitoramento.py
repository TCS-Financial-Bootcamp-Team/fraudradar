"""GET /monitoramento."""

from datetime import date, timedelta

import pytest

from api.repositorios.monitoramento import proporcao, rotulo_semana

S1 = date(2023, 1, 2)


def _monitoramento(cliente, semana=S1) -> dict:
    resposta = cliente.get("/monitoramento", params={"semana": semana.isoformat()})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_semana_vazia_zera_tudo(cliente):
    corpo = _monitoramento(cliente)
    assert corpo["semana"] == "2023-01-02"
    assert set(corpo["indicadores"].values()) == {0}
    assert all(corpo[serie] == [] for serie in ("semanas", "tipologias", "paises"))
    assert corpo["taxa_paises"] == corpo["taxa_meios"] == []


def test_contagens_da_semana(cliente, semente):
    semente.alerta(1, S1, status="novo", valor_total=100)
    semente.alerta(2, S1, status="em_analise", valor_total=50.5)
    semente.alerta(3, S1, status="arquivado")
    semente.alerta(4, S1, status="aprofundado")
    comunicado = semente.alerta(5, S1, status="comunicado")
    so_rascunho = semente.alerta(6, S1, status="comunicado")
    semente.alerta(7, S1 + timedelta(days=7), status="arquivado", valor_total=999)
    semente.comunicacao(comunicado, semente.decisao(comunicado), aprovada_por="Ana")
    semente.comunicacao(so_rascunho, semente.decisao(so_rascunho))
    indicadores = _monitoramento(cliente)["indicadores"]
    assert indicadores["alertas"] == 6
    assert indicadores["revisados"] == 4  # novo e em_analise ainda são pendentes
    assert indicadores["comunicados"] == 1  # só a comunicação aprovada conta
    assert indicadores["valor_sinalizado"] == 100 + 50.5 + 4 * 1000


def test_comunicacao_aprovada_conta_uma_vez(cliente, semente):
    alerta = semente.alerta(1, S1, status="comunicado")
    decisao = semente.decisao(alerta)
    semente.comunicacao(alerta, decisao, aprovada_por="Ana")
    semente.comunicacao(alerta, decisao, aprovada_por="Bia")
    assert _monitoramento(cliente)["indicadores"]["comunicados"] == 1


def test_taxa_de_alerta_e_metricas_do_lote(cliente, semente):
    semente.lote(S1, contas_ativas=200, metricas={"recall": 0.79, "acerto_tipologia": 0.5})
    for conta in range(1, 6):
        semente.alerta(conta, S1)
    indicadores = _monitoramento(cliente)["indicadores"]
    assert indicadores["taxa_alerta"] == pytest.approx(5 / 200)
    assert indicadores["recall"] == 0.79
    assert indicadores["acerto_tipologia"] == 0.5


@pytest.mark.parametrize(
    ("contas_ativas", "alertas", "esperado"),
    [(0, 2, 0.0), (1, 3, 1.0)],
    ids=["sem-contas-ativas", "mais-alertas-que-contas"],
)
def test_taxa_de_alerta_nos_limites(cliente, semente, contas_ativas, alertas, esperado):
    semente.lote(S1, contas_ativas=contas_ativas)
    for conta in range(alertas):
        semente.alerta(conta + 1, S1)
    assert _monitoramento(cliente)["indicadores"]["taxa_alerta"] == esperado


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [(0.4, 0.4), (1, 1.0), (1.7, 1.0), (-0.2, 0.0), ("0.4", 0.0), (True, 0.0), (None, 0.0)],
)
def test_proporcao_aceita_so_numero_entre_0_e_1(valor, esperado):
    assert proporcao(valor) == esperado


def test_proporcao_recusa_nao_finito():
    assert proporcao(float("nan")) == 0.0
    assert proporcao(float("inf")) == 0.0


def test_metricas_invalidas_do_worker_nao_derrubam_a_rota(cliente, semente):
    semente.lote(S1, metricas={"recall": "alto", "acerto_tipologia": 3, "taxa_paises": [1, 2]})
    corpo = _monitoramento(cliente)
    assert corpo["indicadores"]["recall"] == 0.0
    assert corpo["indicadores"]["acerto_tipologia"] == 1.0
    assert corpo["taxa_paises"] == []


def test_taxas_por_pais_e_meio_ordenadas(cliente, semente):
    semente.lote(
        S1,
        metricas={
            "taxa_paises": {"UK": 0.001, "UAE": 0.02, "Mexico": "x", "Turkey": 0.02},
            "taxa_meios": {"Cash Deposit": 0.03, "ACH": 0.002},
        },
    )
    corpo = _monitoramento(cliente)
    assert corpo["taxa_paises"] == [
        {"nome": "Turkey", "valor": 0.02},
        {"nome": "UAE", "valor": 0.02},
        {"nome": "UK", "valor": 0.001},
    ]
    assert [s["nome"] for s in corpo["taxa_meios"]] == ["Cash Deposit", "ACH"]


def test_serie_de_semanas_ate_a_pedida(cliente, semente):
    semanas = [S1 + timedelta(weeks=i) for i in range(14)]
    for semana in semanas:
        semente.lote(semana)
    semente.alerta(1, semanas[12])
    semente.alerta(2, semanas[12])
    semente.alerta(3, semanas[13])
    serie = _monitoramento(cliente, semanas[12])["semanas"]
    assert len(serie) == 12  # a 13ª semana para trás e a 14ª (depois da pedida) ficam fora
    assert serie[0]["nome"] == rotulo_semana(semanas[1])
    assert serie[-1] == {"nome": rotulo_semana(semanas[12]), "valor": 2}
    assert serie[-2]["valor"] == 0


def test_rotulo_da_semana_no_formato_do_front():
    assert rotulo_semana(date(2023, 1, 2)) == "02 jan"
    assert rotulo_semana(date(2022, 9, 12)) == "12 set"


def test_distribuicao_por_tipologia_e_pais(cliente, semente):
    semente.alerta(1, S1, tipologia="Fan-out", paises=("UK", "UAE"))
    semente.alerta(2, S1, tipologia="Fan-out", paises=("UAE",))
    semente.alerta(3, S1, tipologia=None, paises=())
    semente.alerta(4, S1 + timedelta(days=7), tipologia="Ciclo", paises=("UK",))
    corpo = _monitoramento(cliente)
    assert corpo["tipologias"] == [
        {"nome": "Fan-out", "valor": 2},
        {"nome": "Indefinida", "valor": 1},
    ]
    assert corpo["paises"] == [
        {"nome": "Indefinido", "valor": 1},
        {"nome": "UAE", "valor": 1},
        {"nome": "UK", "valor": 1},
    ]


def test_semana_no_meio_da_semana_vira_segunda(cliente, semente):
    semente.alerta(1, S1)
    assert _monitoramento(cliente, S1 + timedelta(days=3))["indicadores"]["alertas"] == 1
