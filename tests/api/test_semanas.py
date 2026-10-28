"""GET /semanas e POST /replay/proxima-semana."""

import json
from datetime import date

S1, S2, S3 = date(2023, 1, 2), date(2023, 1, 9), date(2023, 1, 16)


def test_sem_semana_liberada(cliente, semente):
    semente.lote(S1)  # processada, ainda não liberada
    assert cliente.get("/semanas").json() == {"atual": None, "itens": []}


def test_lista_so_liberadas_da_mais_recente_para_a_mais_antiga(cliente, semente):
    semente.lote(S1, liberada=True)
    semente.lote(S2, liberada=True)
    semente.lote(S3)
    semente.alerta(1, S1, status="novo")
    semente.alerta(2, S1, status="em_analise")
    semente.alerta(3, S1, status="arquivado")
    semente.alerta(4, S1, status="comunicado")
    semente.alerta(5, S3)
    corpo = cliente.get("/semanas").json()
    assert corpo["atual"] == "2023-01-09"
    assert corpo["itens"] == [
        {"semana": "2023-01-09", "alertas": 0, "pendentes": 0},
        {"semana": "2023-01-02", "alertas": 4, "pendentes": 2},
    ]


def test_replay_libera_a_mais_antiga_e_conta_os_alertas(cliente, semente):
    semente.lote(S2)
    semente.lote(S1)
    semente.alerta(1, S1)
    semente.alerta(2, S1)
    semente.alerta(3, S2)
    assert cliente.post("/replay/proxima-semana", json={}).json() == {
        "semana": "2023-01-02",
        "alertas_gerados": 2,
    }
    assert cliente.post("/replay/proxima-semana", json={}).json() == {
        "semana": "2023-01-09",
        "alertas_gerados": 1,
    }
    assert cliente.get("/semanas").json()["atual"] == "2023-01-09"


def test_replay_pula_semana_ja_liberada(cliente, semente):
    semente.lote(S1, liberada=True)
    semente.lote(S2)
    assert cliente.post("/replay/proxima-semana").json()["semana"] == "2023-01-09"


def test_replay_registra_auditoria_com_o_analista(cliente, semente):
    semente.lote(S1)
    semente.alerta(1, S1)
    cliente.post("/replay/proxima-semana")
    linha = semente.linha("SELECT quem, acao, entidade, entidade_id, detalhes FROM auditoria")
    assert linha["quem"] == "Analista local"
    assert (linha["acao"], linha["entidade"], linha["entidade_id"]) == (
        "replay",
        "semana",
        "2023-01-02",
    )
    detalhes = linha["detalhes"]
    detalhes = json.loads(detalhes) if isinstance(detalhes, str) else detalhes
    assert detalhes == {"alertas": 1, "usuario_id": "local"}


def test_replay_sem_semana_processada_409_sem_auditoria(cliente, semente):
    semente.lote(S1, liberada=True)
    resposta = cliente.post("/replay/proxima-semana")
    assert resposta.status_code == 409
    assert "worker" in resposta.json()["detail"]
    assert semente.contar("auditoria") == 0
