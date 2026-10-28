"""Rascunho, aprovação, bloqueio de linha e atomicidade no Postgres."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from threading import Barrier
from time import monotonic, sleep

import pytest
from sqlalchemy import text

from api.dependencias import USUARIO_LOCAL, Usuario, usuario_atual
from api.repositorios import decisoes

JUSTIFICATIVA = "Há indícios suficientes para comunicar a operação."
TEXTO_APROVADO = "Comunicação revisada e aprovada pelo analista responsável."


@pytest.fixture
def alerta(semente):
    return semente.alerta(
        123456789,
        date(2023, 1, 2),
        status="comunicado",
        paises=("UK", "BR"),
        valor_total=1234567.89,
        qtd_transacoes=17,
    )


@pytest.fixture
def rascunho(semente, alerta):
    decisao = semente.decisao(alerta)
    return semente.comunicacao(alerta, decisao)


@pytest.mark.parametrize("aprovar", [False, True], ids=["get", "aprovar"])
@pytest.mark.parametrize("existe_alerta", [False, True], ids=["sem_alerta", "sem_comunicacao"])
def test_comunicacao_inexistente_404(cliente, semente, alerta, aprovar, existe_alerta):
    identificador = alerta if existe_alerta else 999
    caminho = f"/alertas/{identificador}/comunicacao"
    resposta = (
        cliente.post(f"{caminho}/aprovar", json={"texto": TEXTO_APROVADO})
        if aprovar
        else cliente.get(caminho)
    )
    assert resposta.status_code == 404
    assert semente.contar("comunicacoes") == semente.contar("auditoria") == 0
    assert semente.contar("decisoes") == 0


@pytest.mark.parametrize("aprovada", [False, True], ids=["rascunho", "aprovada"])
def test_get_comunicacao_contrato_e_data(cliente, semente, alerta, aprovada):
    decisao = semente.decisao(alerta)
    identificador = semente.comunicacao(
        alerta, decisao, aprovada_por="Revisora" if aprovada else None
    )
    gravada = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=identificador)
    resposta = cliente.get(f"/alertas/{alerta}/comunicacao")
    assert resposta.status_code == 200
    dados = resposta.json()
    assert dados["alerta_id"] == str(alerta)
    assert dados["texto"] == gravada["rascunho"]
    assert dados["status"] == ("aprovada" if aprovada else "rascunho")
    esperado = gravada["aprovado_em"] if aprovada else gravada["criado_em"]
    assert datetime.fromisoformat(dados["atualizado_em"]) == esperado
    assert semente.contar("auditoria") == 0


@pytest.mark.parametrize("empate", [False, True], ids=["data", "desempate_id"])
def test_get_comunicacao_mais_recente_do_alerta(cliente, semente, banco, alerta, empate):
    decisao = semente.decisao(alerta)
    if empate:
        semente.comunicacao(alerta, decisao, "Rascunho anterior empatado na data de criação.")
    esperado = semente.comunicacao(alerta, decisao, "Rascunho mais recente selecionado pelo GET.")
    if not empate:
        antigo = semente.comunicacao(alerta, decisao, "Rascunho antigo com id maior.")
        with banco.begin() as conn:
            conn.execute(
                text("UPDATE comunicacoes SET criado_em = '2020-01-01' WHERE id = :id"),
                {"id": antigo},
            )
    else:
        with banco.begin() as conn:
            conn.execute(text("UPDATE comunicacoes SET criado_em = '2025-01-01'"))
    outro = semente.alerta(999, date(2023, 1, 2))
    semente.comunicacao(outro, semente.decisao(outro), "Rascunho de outro alerta mais novo.")
    resposta = cliente.get(f"/alertas/{alerta}/comunicacao")
    assert resposta.status_code == 200
    gravada = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=esperado)
    assert resposta.json()["texto"] == gravada["rascunho"]


def test_aprovacao_grava_texto_autoria_auditoria_e_data(cliente, semente, banco, alerta, rascunho):
    with banco.begin() as conn:
        conn.execute(text("UPDATE comunicacoes SET criado_em = '2020-01-01'"))
    antes = cliente.get(f"/alertas/{alerta}/comunicacao").json()
    resposta = cliente.post(
        f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": f"  {TEXTO_APROVADO}\n"}
    )
    assert resposta.status_code == 200, resposta.text
    depois = resposta.json()
    gravada = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    assert depois["alerta_id"] == str(alerta)
    assert depois["status"] == gravada["status"] == "aprovada"
    assert depois["texto"] == gravada["rascunho"] == TEXTO_APROVADO
    assert gravada["aprovado_por"] == USUARIO_LOCAL.nome
    assert datetime.fromisoformat(depois["atualizado_em"]) == gravada["aprovado_em"]
    assert datetime.fromisoformat(antes["atualizado_em"]) == gravada["criado_em"]
    assert gravada["aprovado_em"] > gravada["criado_em"]
    assert cliente.get(f"/alertas/{alerta}/comunicacao").json() == depois
    assert semente.contar("comunicacoes") == 1
    assert semente.contar("decisoes") == 1
    assert semente.contar("auditoria") == 1
    auditoria = semente.linha("SELECT * FROM auditoria")
    assert auditoria["acao"] == "comunicacao_aprovada"
    assert auditoria["quem"] == USUARIO_LOCAL.nome
    assert auditoria["entidade"] == "alerta"
    assert auditoria["entidade_id"] == str(alerta)
    assert auditoria["detalhes"] == {"comunicacao_id": rascunho, "usuario_id": USUARIO_LOCAL.id}


def test_aprovacao_usa_usuario_autenticado(cliente, semente, alerta, rascunho):
    usuario = Usuario(id="revisora-77", nome="Maria Revisora")
    cliente.app.dependency_overrides[usuario_atual] = lambda: usuario
    try:
        resposta = cliente.post(
            f"/alertas/{alerta}/comunicacao/aprovar",
            json={"texto": TEXTO_APROVADO, "aprovado_por": "Nome falsificado"},
        )
    finally:
        cliente.app.dependency_overrides.pop(usuario_atual)
    assert resposta.status_code == 200
    gravada = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    assert gravada["aprovado_por"] == usuario.nome
    auditoria = semente.linha("SELECT * FROM auditoria")
    assert auditoria["quem"] == usuario.nome
    assert auditoria["detalhes"]["usuario_id"] == usuario.id


@pytest.mark.parametrize("texto", ["  " + "a" * 29 + "  ", " " * 40, "a" * 20001])
def test_aprovacao_texto_invalido_apos_trim(cliente, semente, alerta, rascunho, texto):
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    resposta = cliente.post(f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": texto})
    assert resposta.status_code == 422
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho) == antes
    assert semente.contar("auditoria") == 0


def test_aprovacao_duplicada_nao_grava(cliente, semente, alerta, rascunho):
    caminho = f"/alertas/{alerta}/comunicacao/aprovar"
    assert cliente.post(caminho, json={"texto": TEXTO_APROVADO}).status_code == 200
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    auditoria = semente.linha("SELECT * FROM auditoria")
    resposta = cliente.post(
        caminho, json={"texto": "Outro texto que não deve substituir o aprovado."}
    )
    assert resposta.status_code == 409
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho) == antes
    assert semente.linha("SELECT * FROM auditoria") == auditoria
    assert semente.contar("auditoria") == semente.contar("decisoes") == 1


def test_aprovacao_anterior_fecha_mesmo_com_rascunho_novo(cliente, semente, alerta, rascunho):
    caminho = f"/alertas/{alerta}/comunicacao/aprovar"
    assert cliente.post(caminho, json={"texto": TEXTO_APROVADO}).status_code == 200
    decisao = semente.decisao(alerta)
    novo = semente.comunicacao(alerta, decisao)
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=novo)
    assert cliente.post(caminho, json={"texto": TEXTO_APROVADO}).status_code == 409
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=novo) == antes
    assert semente.contar("auditoria") == 1


@pytest.mark.parametrize("decisao", ["arquivar", "aprofundar"])
def test_aprovacao_bloqueada_apos_mudar_decisao(cliente, semente, alerta, rascunho, decisao):
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    assert (
        cliente.post(
            f"/alertas/{alerta}/decisao", json={"decisao": decisao, "justificativa": JUSTIFICATIVA}
        ).status_code
        == 200
    )
    resposta = cliente.post(
        f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO}
    )
    assert resposta.status_code == 409
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho) == antes
    assert semente.contar("comunicacoes") == 1
    assert semente.contar("decisoes") == 2
    assert semente.contar("auditoria") == 1


@pytest.mark.parametrize("status_alerta", ["novo", "em_analise", "arquivado", "aprofundado"])
def test_aprovacao_exige_status_comunicado(
    cliente, semente, banco, alerta, rascunho, status_alerta
):
    with banco.begin() as conn:
        conn.execute(
            text("UPDATE alertas SET status = :status WHERE id = :id"),
            {"id": alerta, "status": status_alerta},
        )
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    resposta = cliente.post(
        f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO}
    )
    assert resposta.status_code == 409
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho) == antes
    assert semente.contar("auditoria") == 0
    assert semente.contar("decisoes") == 1


@pytest.mark.parametrize("empate", [False, True], ids=["data", "desempate_id"])
def test_aprovacao_atualiza_so_comunicacao_mais_recente(cliente, semente, banco, alerta, empate):
    decisao = semente.decisao(alerta)
    if empate:
        outra = semente.comunicacao(alerta, decisao)
    esperada = semente.comunicacao(alerta, decisao)
    if not empate:
        outra = semente.comunicacao(alerta, decisao)
    with banco.begin() as conn:
        conn.execute(text("UPDATE comunicacoes SET criado_em = '2025-01-01'"))
        if not empate:
            conn.execute(
                text("UPDATE comunicacoes SET criado_em = '2020-01-01' WHERE id = :id"),
                {"id": outra},
            )
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=outra)
    resposta = cliente.post(
        f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO}
    )
    assert resposta.status_code == 200
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=outra) == antes
    assert semente.linha("SELECT status FROM comunicacoes WHERE id = :id", id=esperada) == {
        "status": "aprovada"
    }
    assert semente.linha("SELECT detalhes FROM auditoria")["detalhes"]["comunicacao_id"] == esperada


@pytest.mark.parametrize("com_parecer", [False, True])
def test_rascunho_conteudo_deterministico_e_limite(cliente, semente, alerta, com_parecer):
    if com_parecer:
        semente.parecer(alerta, "Parecer mais recente. " + "x" * 25000)
    pedido = {"decisao": "comunicar", "justificativa": JUSTIFICATIVA}
    assert cliente.post(f"/alertas/{alerta}/decisao", json=pedido).status_code == 200
    gravada = semente.linha("SELECT * FROM comunicacoes")
    texto = gravada["rascunho"]
    assert texto.startswith("COMUNICAÇÃO DE OPERAÇÃO SUSPEITA — SIMULAÇÃO ACADÊMICA")
    for trecho in (
        "Conta: 123456789",
        "02/01/2023 a 08/01/2023",
        "90.0%",
        "Fan-out",
        "1.234.567,89",
        "17",
        "UK, BR",
        JUSTIFICATIVA,
    ):
        assert trecho in texto
    assert 30 <= len(texto) <= 20000
    if com_parecer:
        assert "Parecer mais recente." in texto
        assert len(texto) == 20000
    else:
        assert "Parecer mais recente" not in texto
    assert texto.endswith(
        "Rascunho gerado pelo FraudRadar PLD. Deve ser revisado antes da aprovação."
    )
    with semente.engine.connect() as conn:
        linha = decisoes.linha_do_alerta(conn, alerta)
        parecer = "Parecer mais recente. " + "x" * 25000 if com_parecer else None
        assert decisoes.rascunho_comunicacao(linha, JUSTIFICATIVA, parecer) == texto


def test_rascunho_tipologia_e_paises_indefinidos(cliente, semente):
    alerta = semente.alerta(77, date(2023, 1, 2), tipologia=None, paises=())
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao",
        json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA},
    )
    assert resposta.status_code == 200
    texto = semente.linha("SELECT rascunho FROM comunicacoes")["rascunho"]
    assert "Tipologia prevista: Indefinida" in texto
    assert "Países: Indefinidos" in texto


def test_rascunho_metadados_extensos_respeita_limite(cliente, semente):
    alerta = semente.alerta(77, date(2023, 1, 2), tipologia="T" * 22000)
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao",
        json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA},
    )
    assert resposta.status_code == 200
    texto = semente.linha("SELECT rascunho FROM comunicacoes")["rascunho"]
    assert len(texto) == 20000
    assert texto.endswith("Deve ser revisado antes da aprovação.")


def test_aprovacao_falha_tardia_desfaz_escritas(cliente, semente, alerta, rascunho, monkeypatch):
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho)
    auditar = decisoes._auditar

    def falhar(*args, **kwargs):
        auditar(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(decisoes, "_auditar", falhar)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        cliente.post(f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO})
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=rascunho) == antes
    assert semente.contar("auditoria") == 0
    assert semente.contar("decisoes") == 1


@pytest.mark.parametrize("outra_aprovada", [False, True], ids=["rascunho", "aprovada"])
def test_escritas_isolam_outros_alertas(cliente, semente, alerta, outra_aprovada):
    outro = semente.alerta(999, date(2023, 1, 2), status="comunicado")
    outra = semente.comunicacao(
        outro, semente.decisao(outro), aprovada_por="Revisora" if outra_aprovada else None
    )
    antes = semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=outra)
    resposta = cliente.post(
        f"/alertas/{alerta}/decisao",
        json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA},
    )
    assert resposta.status_code == 200
    assert semente.contar("comunicacoes", "alerta_id = :id", id=alerta) == 1
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=outra) == antes
    resposta = cliente.post(
        f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO}
    )
    assert resposta.status_code == 200
    assert semente.linha("SELECT * FROM comunicacoes WHERE id = :id", id=outra) == antes
    assert semente.linha("SELECT status FROM comunicacoes WHERE alerta_id = :id", id=alerta) == {
        "status": "aprovada"
    }


@pytest.mark.parametrize("aprovar", [False, True], ids=["decisao", "aprovar"])
def test_escrita_trava_alerta_antes_de_gravar(cliente, semente, banco, alerta, rascunho, aprovar):
    caminho = f"/alertas/{alerta}/comunicacao/aprovar" if aprovar else f"/alertas/{alerta}/decisao"
    pedido = (
        {"texto": TEXTO_APROVADO}
        if aprovar
        else {"decisao": "comunicar", "justificativa": JUSTIFICATIVA}
    )
    with ThreadPoolExecutor(max_workers=1) as executor:
        with banco.begin() as conn:
            pid = conn.execute(text("SELECT pg_backend_pid()")).scalar_one()
            conn.execute(text("SELECT id FROM alertas WHERE id = :id FOR UPDATE"), {"id": alerta})
            futuro = executor.submit(cliente.post, caminho, json=pedido)
            prazo = monotonic() + 5
            bloqueada = None
            while monotonic() < prazo:
                bloqueada = semente.linha(
                    "SELECT query FROM pg_stat_activity WHERE :pid = ANY(pg_blocking_pids(pid))",
                    pid=pid,
                )
                if bloqueada is not None or futuro.done():
                    break
                sleep(0.02)
            assert bloqueada is not None, "A requisição não esperou pelo bloqueio do alerta."
            assert "FOR UPDATE" in bloqueada["query"]
            assert "FROM alertas" in bloqueada["query"]
            assert semente.contar("auditoria") == 0
            assert semente.contar("decisoes") == 1
            assert semente.linha("SELECT status FROM comunicacoes WHERE id = :id", id=rascunho) == {
                "status": "rascunho"
            }
        assert futuro.result(timeout=5).status_code == 200


@pytest.mark.parametrize("aprovar", [False, True], ids=["comunicar", "aprovar"])
def test_escritas_concorrentes_serializadas(cliente, semente, alerta, aprovar):
    if aprovar:
        semente.comunicacao(alerta, semente.decisao(alerta))
    barreira = Barrier(2)

    def enviar():
        barreira.wait(timeout=5)
        if aprovar:
            return cliente.post(
                f"/alertas/{alerta}/comunicacao/aprovar", json={"texto": TEXTO_APROVADO}
            ).status_code
        return cliente.post(
            f"/alertas/{alerta}/decisao",
            json={"decisao": "comunicar", "justificativa": JUSTIFICATIVA},
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        futuros = [executor.submit(enviar) for _ in range(2)]
        respostas = sorted(futuro.result(timeout=10) for futuro in futuros)
    assert respostas == ([200, 409] if aprovar else [200, 200])
    assert semente.contar("comunicacoes") == 1
    assert semente.contar("auditoria") == (1 if aprovar else 2)
    assert semente.contar("decisoes") == (1 if aprovar else 2)
