"""Decisões transacionais do analista contra Postgres."""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import text

from api.dependencias import USUARIO_LOCAL, Usuario, usuario_atual
from api.repositorios import decisoes

JUSTIFICATIVA = "Movimentação incompatível com o perfil observado."


@pytest.fixture
def alerta(semente):
    return semente.alerta(123456789, date(2023, 1, 2), paises=("UK", "BR"))


def test_decisao_alerta_inexistente(cliente, semente):
    resposta = cliente.post(
        "/alertas/999/decisao", json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA}
    )
    assert resposta.status_code == 404
    for tabela in ("decisoes", "comunicacoes", "auditoria"):
        assert semente.contar(tabela) == 0


@pytest.mark.parametrize(
    ("decisao", "status_banco", "status_resposta"),
    [
        ("arquivar", "arquivado", "arquivado"),
        ("aprofundar", "aprofundado", "aprofundar"),
        ("comunicar", "comunicado", "comunicar"),
    ],
)
def test_decisao_status_autoria_auditoria_e_sem_parecer(
    cliente, semente, banco, alerta, decisao, status_banco, status_resposta
):
    with banco.begin() as conn:
        conn.execute(
            text("UPDATE alertas SET atualizado_em = '2020-01-01' WHERE id = :id"), {"id": alerta}
        )
    antes = semente.linha("SELECT atualizado_em FROM alertas WHERE id = :id", id=alerta)
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao",
        json={"decisao": decisao, "justificativa": f"  {JUSTIFICATIVA}\n"},
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json() == {
        "id": str(alerta),
        "conta": "123456789",
        "semana": "2023-01-02",
        "pais": "UK",
        "tipologia": "Fan-out",
        "score": 90.0,
        "valor": 1000.0,
        "transacoes": 3,
        "status": status_resposta,
    }
    atual = semente.linha("SELECT * FROM alertas WHERE id = :id", id=alerta)
    assert atual["status"] == status_banco
    assert atual["atualizado_em"] > antes["atualizado_em"]
    gravada = semente.linha("SELECT * FROM decisoes WHERE alerta_id = :id", id=alerta)
    assert gravada["decisao"] == decisao
    assert gravada["justificativa"] == JUSTIFICATIVA
    assert gravada["parecer_id"] is None
    assert gravada["analista"] == USUARIO_LOCAL.nome
    assert semente.contar("decisoes") == 1
    assert semente.contar("auditoria") == 1
    auditoria = semente.linha("SELECT * FROM auditoria")
    assert auditoria["acao"] == "decisao"
    assert auditoria["quem"] == USUARIO_LOCAL.nome
    assert auditoria["entidade"] == "alerta"
    assert auditoria["entidade_id"] == str(alerta)
    assert auditoria["detalhes"] == {
        "decisao": decisao,
        "decisao_id": gravada["id"],
        "usuario_id": USUARIO_LOCAL.id,
    }
    assert semente.contar("comunicacoes") == (1 if decisao == "comunicar" else 0)


@pytest.mark.parametrize("justificativa", ["   curta   ", " " * 15, "a" * 4001])
def test_decisao_justificativa_invalida_apos_trim(cliente, semente, alerta, justificativa):
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao", json={"decisao": "arquivar", "justificativa": justificativa}
    )
    assert resposta.status_code == 422
    assert semente.contar("decisoes") == semente.contar("auditoria") == 0


def test_decisao_fora_do_contrato(cliente, semente, alerta):
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao", json={"decisao": "aprovar", "justificativa": JUSTIFICATIVA}
    )
    assert resposta.status_code == 422
    assert semente.contar("decisoes") == semente.contar("auditoria") == 0


@pytest.mark.parametrize("empate", [False, True], ids=["data", "desempate_id"])
def test_decisao_usa_parecer_mais_recente_do_alerta(cliente, semente, alerta, empate):
    recente = datetime(2025, 1, 1, tzinfo=UTC)
    antigo = datetime(2024, 1, 1, tzinfo=UTC)
    if empate:
        semente.parecer(alerta, "Parecer anterior empatado.", criado_em=recente)
    esperado = semente.parecer(alerta, "Parecer mais recente escolhido.", criado_em=recente)
    if not empate:
        semente.parecer(alerta, "Parecer antigo com id maior.", criado_em=antigo)
    outro = semente.alerta(999, date(2023, 1, 2))
    semente.parecer(outro, "Parecer de outra conta.")
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao",
        json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA},
    )
    assert resposta.status_code == 200
    gravada = semente.linha("SELECT * FROM decisoes WHERE alerta_id = :id", id=alerta)
    assert gravada["parecer_id"] == esperado
    comunicacao = semente.linha("SELECT * FROM comunicacoes WHERE alerta_id = :id", id=alerta)
    assert "Parecer mais recente escolhido." in comunicacao["rascunho"]
    assert "Parecer anterior" not in comunicacao["rascunho"]
    assert "Parecer antigo" not in comunicacao["rascunho"]
    assert "outra conta" not in comunicacao["rascunho"]


def test_decisao_usa_usuario_autenticado(cliente, semente, alerta):
    usuario = Usuario(id="analista-42", nome="Joana Revisora")
    cliente.app.dependency_overrides[usuario_atual] = lambda: usuario
    try:
        resposta = cliente.post(
            f"/alertas/{alerta}/decisao",
            json={
                "decisao": "arquivar",
                "justificativa": JUSTIFICATIVA,
                "analista": "Nome falsificado",
            },
        )
    finally:
        cliente.app.dependency_overrides.pop(usuario_atual)
    assert resposta.status_code == 200
    assert semente.linha("SELECT analista FROM decisoes")["analista"] == usuario.nome
    auditoria = semente.linha("SELECT * FROM auditoria")
    assert auditoria["quem"] == usuario.nome
    assert auditoria["detalhes"]["usuario_id"] == usuario.id


def test_comunicar_reutiliza_rascunho_e_refaz_o_texto(cliente, semente, banco, alerta):
    pedido = {"decisao": "comunicar", "justificativa": JUSTIFICATIVA}
    assert cliente.post(f"/alertas/{alerta}/decisao", json=pedido).status_code == 200
    with banco.begin() as conn:
        conn.execute(text("UPDATE comunicacoes SET criado_em = criado_em - interval '1 day'"))
    antes = semente.linha("SELECT * FROM comunicacoes")
    nova = "Novos indícios: retirada em espécie no exterior logo após o depósito."
    pedido = {"decisao": "comunicar", "justificativa": nova}
    assert cliente.post(f"/alertas/{alerta}/decisao", json=pedido).status_code == 200
    depois = semente.linha("SELECT * FROM comunicacoes")
    assert semente.contar("comunicacoes") == 1
    assert depois["id"] == antes["id"]
    # O rascunho cita a justificativa vigente, não a da primeira decisão.
    assert nova in depois["rascunho"] and JUSTIFICATIVA not in depois["rascunho"]
    assert depois["criado_em"] > antes["criado_em"]
    assert depois["decisao_id"] != antes["decisao_id"]
    ultima = semente.linha("SELECT id FROM decisoes ORDER BY id DESC LIMIT 1")
    assert depois["decisao_id"] == ultima["id"]
    assert semente.contar("decisoes") == semente.contar("auditoria") == 2


@pytest.mark.parametrize("decisao", ["arquivar", "aprofundar", "comunicar"])
def test_decisao_apos_aprovacao_nao_grava(cliente, semente, alerta, decisao):
    anterior = semente.decisao(alerta)
    semente.comunicacao(alerta, anterior, aprovada_por="Revisora")
    # Mesmo com um rascunho mais novo, a aprovação anterior fecha o alerta.
    semente.comunicacao(alerta, anterior)
    antes = semente.linha("SELECT * FROM alertas WHERE id = :id", id=alerta)
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao", json={"decisao": decisao, "justificativa": JUSTIFICATIVA}
    )
    assert resposta.status_code == 409
    assert semente.contar("decisoes") == 1
    assert semente.contar("auditoria") == 0
    assert semente.contar("comunicacoes") == 2
    assert semente.linha("SELECT * FROM alertas WHERE id = :id", id=alerta) == antes


def test_alerta_decidido_pode_mudar_e_preserva_rascunho(cliente, semente, alerta):
    for decisao in ("arquivar", "comunicar", "arquivar", "aprofundar", "comunicar"):
        resposta = cliente.post(
            f"/alertas/{alerta}/decisao", json={"decisao": decisao, "justificativa": JUSTIFICATIVA}
        )
        assert resposta.status_code == 200
        assert semente.contar("comunicacoes") == (0 if semente.contar("decisoes") == 1 else 1)
    assert semente.contar("decisoes") == semente.contar("auditoria") == 5


@pytest.mark.parametrize("cenario", ["arquivar", "comunicar", "reutilizar"])
def test_decisao_falha_tardia_desfaz_todas_as_escritas(
    cliente, semente, alerta, monkeypatch, cenario
):
    antes = semente.linha("SELECT * FROM alertas WHERE id = :id", id=alerta)
    decisao = "comunicar" if cenario == "reutilizar" else cenario
    comunicacao = None
    if cenario == "reutilizar":
        semente.comunicacao(alerta, semente.decisao(alerta))
        comunicacao = semente.linha("SELECT * FROM comunicacoes")
    auditar = decisoes._auditar

    def falhar(*args, **kwargs):
        auditar(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(decisoes, "_auditar", falhar)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        cliente.post(
            f"/alertas/{alerta}/decisao", json={"decisao": decisao, "justificativa": JUSTIFICATIVA}
        )
    assert semente.linha("SELECT * FROM alertas WHERE id = :id", id=alerta) == antes
    assert semente.contar("auditoria") == 0
    assert semente.contar("decisoes") == (1 if comunicacao else 0)
    assert semente.contar("comunicacoes") == (1 if comunicacao else 0)
    assert semente.linha("SELECT * FROM comunicacoes") == comunicacao
