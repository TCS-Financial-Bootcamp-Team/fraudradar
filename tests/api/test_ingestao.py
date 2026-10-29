"""Ingestão de transações (CSV e avulsa) contra Postgres."""

import asyncio
from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import text

from api.dependencias import USUARIO_LOCAL, Usuario, usuario_atual
from api.repositorios import ingestao
from api.schemas.ingestao import PedidoTransacao
from fraudradar.config import get_settings
from fraudradar.dados.schema import COLUNAS_TRANSACAO

CABECALHO = ",".join(COLUNAS_TRANSACAO)
LINHA = "10:35:19,2022-10-07,8724731955,2769355426,1459.15,UK pounds,Euro,UK,France,Cross-border"
TRANSACAO = {
    "Time": "10:35",
    "Date": "2022-10-07",
    "Sender_account": "8724731955",
    "Receiver_account": "2769355426",
    "Amount": 1459.15,
    "Payment_currency": "UK pounds",
    "Received_currency": "Euro",
    "Sender_bank_location": "UK",
    "Receiver_bank_location": "France",
    "Payment_type": "Cross-border",
}


def _csv(*linhas: str, cabecalho: str = CABECALHO) -> bytes:
    return "\n".join([cabecalho, *linhas, ""]).encode()


def _enviar(cliente, conteudo: bytes, nome: str = "extrato.csv"):
    return cliente.post("/ingestao/csv", files={"arquivo": (nome, conteudo, "text/csv")})


def _linhas(banco, sql: str) -> list[dict]:
    with banco.connect() as conn:
        return [dict(r) for r in conn.execute(text(sql)).mappings()]


def _nada_gravado(semente) -> bool:
    return all(
        semente.contar(tabela) == 0
        for tabela in ("transacoes", "ingestoes", "auditoria", "avaliacao")
    )


@pytest.fixture
def limite(monkeypatch):
    """Troca INGESTAO_MAX_BYTES / INGESTAO_MAX_LINHAS só neste teste."""

    def trocar(variavel: str, valor: int) -> None:
        monkeypatch.setenv(variavel, str(valor))
        get_settings.cache_clear()

    return trocar


# --- POST /ingestao/csv ----------------------------------------------------------------------


def test_csv_valido_grava_todas_as_linhas_e_devolve_recibo(cliente, semente, banco):
    extremos = "23:59,2023-01-02,1,9223372036854775807,0.01,Yen,Yen,Japan,Japan,Cash Deposit"
    resposta = _enviar(cliente, _csv(LINHA, "", extremos))
    assert resposta.status_code == 201, resposta.text
    recibo = resposta.json()
    assert recibo["status"] == "recebido"
    assert recibo["mensagem"].startswith("2 transações recebidas.")
    envio = semente.linha("SELECT * FROM ingestoes")
    assert str(envio["id"]) == recibo["id"]
    assert (envio["origem"], envio["nome_arquivo"], envio["linhas"]) == ("csv", "extrato.csv", 2)
    assert (envio["status"], envio["quem"]) == ("recebido", USUARIO_LOCAL.nome)
    gravadas = _linhas(banco, "SELECT * FROM transacoes ORDER BY id")
    assert [{k: v for k, v in t.items() if k != "id"} for t in gravadas] == [
        {
            "data_hora": datetime(2022, 10, 7, 10, 35, 19),
            "remetente": 8724731955,
            "recebedor": 2769355426,
            "valor": Decimal("1459.15"),
            "moeda_pagamento": "UK pounds",
            "moeda_recebida": "Euro",
            "pais_remetente": "UK",
            "pais_recebedor": "France",
            "tipo_pagamento": "Cross-border",
            "ingestao_id": envio["id"],
        },
        {
            "data_hora": datetime(2023, 1, 2, 23, 59),
            "remetente": 1,
            "recebedor": 2**63 - 1,
            "valor": Decimal("0.01"),
            "moeda_pagamento": "Yen",
            "moeda_recebida": "Yen",
            "pais_remetente": "Japan",
            "pais_recebedor": "Japan",
            "tipo_pagamento": "Cash Deposit",
            "ingestao_id": envio["id"],
        },
    ]
    assert semente.contar("avaliacao") == 0


def test_csv_com_colunas_em_outra_ordem_bom_e_crlf(cliente, semente):
    cabecalho = ",".join(reversed(COLUNAS_TRANSACAO))
    linha = ",".join(reversed(LINHA.split(",")))
    conteudo = b"\xef\xbb\xbf" + _csv(linha, linha, cabecalho=cabecalho).replace(b"\n", b"\r\n")
    assert _enviar(cliente, conteudo).status_code == 201
    assert semente.contar("transacoes", "remetente = 8724731955 AND valor = 1459.15") == 2


@pytest.mark.parametrize(
    "rotulos", [["Is_laundering"], ["Laundering_type"], ["Is_laundering", "Laundering_type"]]
)
def test_csv_com_coluna_de_avaliacao_e_recusado(cliente, semente, rotulos):
    valores = {"Is_laundering": "1", "Laundering_type": "Structuring"}
    conteudo = _csv(
        ",".join([LINHA, *(valores[r] for r in rotulos)]),
        cabecalho=",".join([CABECALHO, *rotulos]),
    )
    resposta = _enviar(cliente, conteudo)
    assert resposta.status_code == 422
    detalhe = resposta.json()["detail"]
    assert [e["loc"] for e in detalhe] == [["body", "arquivo", 1, r] for r in rotulos]
    assert all("Rótulo de avaliação não entra pela API" in e["msg"] for e in detalhe)
    assert _nada_gravado(semente)


def test_csv_sem_uma_coluna_e_recusado(cliente, semente):
    sem_amount = [c for c in COLUNAS_TRANSACAO if c != "Amount"]
    resposta = _enviar(cliente, _csv(LINHA, cabecalho=",".join(sem_amount)))
    assert resposta.status_code == 422
    assert resposta.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["body", "arquivo", 1, "Amount"],
            "msg": "Linha 1, coluna Amount: Coluna obrigatória ausente.",
        }
    ]
    assert _nada_gravado(semente)


def test_csv_com_uma_linha_ruim_nao_grava_nada(cliente, semente):
    ruim = LINHA.replace("1459.15", "-3")
    resposta = _enviar(cliente, _csv(LINHA, LINHA, ruim, LINHA))
    assert resposta.status_code == 422
    assert resposta.json()["detail"] == [
        {
            "type": "value_error",
            "loc": ["body", "arquivo", 4, "Amount"],
            "msg": "Linha 4, coluna Amount: O valor deve ser maior que zero.",
        }
    ]
    assert _nada_gravado(semente)


def test_csv_lista_so_os_20_primeiros_erros(cliente, semente):
    ruins = [LINHA.replace("10:35:19", "99:00")] * 30
    detalhe = _enviar(cliente, _csv(*ruins)).json()["detail"]
    assert [e["loc"] for e in detalhe] == [["body", "arquivo", n, "Time"] for n in range(2, 22)]
    assert _nada_gravado(semente)


@pytest.mark.parametrize("conta", ["ACC-123", "12 34", "0123", "9223372036854775808"])
def test_csv_com_conta_fora_do_bigint_positivo_e_recusado(cliente, semente, conta):
    resposta = _enviar(cliente, _csv(LINHA.replace("8724731955", conta)))
    assert resposta.status_code == 422
    [erro] = resposta.json()["detail"]
    assert erro["loc"] == ["body", "arquivo", 2, "Sender_account"]
    assert _nada_gravado(semente)


@pytest.mark.parametrize(
    ("conteudo", "mensagem"),
    [(b"", "O arquivo está vazio."), (_csv(), "O CSV não tem transações, só o cabeçalho.")],
)
def test_csv_sem_transacoes_e_recusado(cliente, semente, conteudo, mensagem):
    resposta = _enviar(cliente, conteudo)
    assert resposta.status_code == 422
    assert resposta.json()["detail"] == [
        {"type": "value_error", "loc": ["body", "arquivo"], "msg": mensagem}
    ]
    assert _nada_gravado(semente)


def test_csv_sem_o_campo_arquivo_e_recusado(cliente, semente):
    resposta = cliente.post("/ingestao/csv", files={"outro": ("a.csv", _csv(LINHA), "text/csv")})
    assert resposta.status_code == 422
    assert _nada_gravado(semente)


def test_csv_acima_do_limite_de_bytes_413(cliente, semente, limite):
    limite("INGESTAO_MAX_BYTES", 2048)
    resposta = _enviar(cliente, _csv(*[LINHA] * 30))
    assert resposta.status_code == 413
    assert resposta.json()["detail"] == (
        "O envio passa do limite de 2048 bytes. Divida o CSV em partes menores."
    )
    assert _nada_gravado(semente)


def test_csv_sem_content_length_tambem_respeita_o_limite(cliente, semente, limite):
    limite("INGESTAO_MAX_BYTES", 2048)
    fronteira = "fronteira"

    def corpo():  # gerador: o httpx manda em chunked, sem Content-Length
        yield (
            f'--{fronteira}\r\nContent-Disposition: form-data; name="arquivo";'
            f' filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n'
        ).encode()
        yield _csv(*[LINHA] * 30)
        yield f"\r\n--{fronteira}--\r\n".encode()

    resposta = cliente.post(
        "/ingestao/csv",
        content=corpo(),
        headers={"content-type": f"multipart/form-data; boundary={fronteira}"},
    )
    assert resposta.status_code == 413
    assert _nada_gravado(semente)


def test_limite_para_de_ler_o_corpo_no_meio_do_envio(limite):
    """Os bytes são contados enquanto chegam: um envio grande é cortado sem ser lido todo."""
    limite("INGESTAO_MAX_BYTES", 4096)
    from api.main import criar_app

    pedacos = [
        b'--x\r\nContent-Disposition: form-data; name="arquivo"; filename="a.csv"\r\n\r\n',
        *[b"a" * 1024] * 100,
    ]
    lidos = 0
    respostas: list[dict] = []

    async def receber() -> dict:
        nonlocal lidos
        lidos += 1
        return {"type": "http.request", "body": pedacos[lidos - 1], "more_body": lidos < 101}

    async def enviar(mensagem: dict) -> None:
        respostas.append(mensagem)

    escopo = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/ingestao/csv",
        "raw_path": b"/ingestao/csv",
        "query_string": b"",
        "root_path": "",
        "headers": [(b"content-type", b"multipart/form-data; boundary=x")],
        "client": ("teste", 1),
        "server": ("teste", 80),
    }
    asyncio.run(criar_app()(escopo, receber, enviar))
    assert respostas[0]["status"] == 413
    assert lidos <= 6  # passou dos 4 KiB no 5º pedaço; os outros 95 nem foram pedidos


def test_csv_acima_do_limite_de_linhas_413(cliente, semente, limite):
    limite("INGESTAO_MAX_LINHAS", 3)
    resposta = _enviar(cliente, _csv(*[LINHA] * 4))
    assert resposta.status_code == 413
    assert resposta.json()["detail"] == (
        "O arquivo passa de 3 linhas. Divida o CSV em partes menores."
    )
    assert _nada_gravado(semente)
    assert _enviar(cliente, _csv(*[LINHA] * 3)).status_code == 201


def test_nome_do_arquivo_fica_sem_pastas_nem_controle():
    assert ingestao._nome_do_arquivo("C:\\dados\\ext\x00rato.csv") == "extrato.csv"
    assert ingestao._nome_do_arquivo("../../etc/a.csv") == "a.csv"
    assert ingestao._nome_do_arquivo("a" * 300) == "a" * 255
    assert ingestao._nome_do_arquivo("") is None
    assert ingestao._nome_do_arquivo(None) is None


# --- POST /ingestao/transacoes ---------------------------------------------------------------


def test_pedido_tem_as_colunas_do_csv():
    assert list(PedidoTransacao.model_fields) == COLUNAS_TRANSACAO


def test_transacao_avulsa_grava_e_devolve_recibo(cliente, semente):
    resposta = cliente.post(
        "/ingestao/transacoes", json={**TRANSACAO, "Sender_account": " 8724731955 "}
    )
    assert resposta.status_code == 201, resposta.text
    recibo = resposta.json()
    assert recibo["status"] == "recebido"
    assert recibo["mensagem"].startswith("1 transação recebida.")
    envio = semente.linha("SELECT * FROM ingestoes")
    assert str(envio["id"]) == recibo["id"]
    assert (envio["origem"], envio["nome_arquivo"], envio["linhas"]) == ("manual", None, 1)
    gravada = semente.linha("SELECT * FROM transacoes")
    assert gravada["data_hora"] == datetime(2022, 10, 7, 10, 35)
    assert (gravada["remetente"], gravada["recebedor"]) == (8724731955, 2769355426)
    assert gravada["valor"] == Decimal("1459.15")
    assert gravada["ingestao_id"] == envio["id"]
    assert semente.contar("avaliacao") == 0


@pytest.mark.parametrize(
    "pedido",
    [
        pytest.param({**TRANSACAO, "Is_laundering": 1}, id="rotulo"),
        pytest.param({**TRANSACAO, "canal": "app"}, id="campo-extra"),
        pytest.param({k: v for k, v in TRANSACAO.items() if k != "Date"}, id="sem-date"),
        pytest.param({**TRANSACAO, "Amount": "1459.15"}, id="valor-em-texto"),
        pytest.param({**TRANSACAO, "Sender_account": 8724731955}, id="conta-em-numero"),
    ],
)
def test_transacao_fora_do_contrato_422(cliente, semente, pedido):
    assert cliente.post("/ingestao/transacoes", json=pedido).status_code == 422
    assert _nada_gravado(semente)


@pytest.mark.parametrize(
    ("campo", "valor"),
    [("Receiver_account", "ACC-1"), ("Time", "25:00"), ("Date", "2023-02-30")],
)
def test_transacao_com_campo_invalido_422(cliente, semente, campo, valor):
    resposta = cliente.post("/ingestao/transacoes", json={**TRANSACAO, campo: valor})
    assert resposta.status_code == 422
    [erro] = resposta.json()["detail"]
    assert erro["loc"] == ["body", campo]
    assert not erro["msg"].startswith("Linha")
    assert _nada_gravado(semente)


def test_transacao_com_valor_nao_finito_422(cliente, semente):
    corpo = str(TRANSACAO).replace("'", '"').replace("1459.15", "NaN")
    resposta = cliente.post(
        "/ingestao/transacoes", content=corpo, headers={"content-type": "application/json"}
    )
    assert resposta.status_code == 422
    assert resposta.json()["detail"][0]["loc"] == ["body", "Amount"]
    assert _nada_gravado(semente)


# --- autoria, auditoria e rollback -----------------------------------------------------------


def test_ingestao_audita_com_o_analista_local(cliente, banco):
    assert _enviar(cliente, _csv(LINHA, LINHA)).status_code == 201
    assert cliente.post("/ingestao/transacoes", json=TRANSACAO).status_code == 201
    auditoria = _linhas(banco, "SELECT * FROM auditoria ORDER BY id")
    assert [(a["quem"], a["acao"], a["entidade"], a["entidade_id"]) for a in auditoria] == [
        (USUARIO_LOCAL.nome, "ingestao", "ingestao", "1"),
        (USUARIO_LOCAL.nome, "ingestao", "ingestao", "2"),
    ]
    assert auditoria[0]["detalhes"] == {
        "origem": "csv",
        "linhas": 2,
        "nome_arquivo": "extrato.csv",
        "usuario_id": USUARIO_LOCAL.id,
    }
    assert auditoria[1]["detalhes"] == {
        "origem": "manual",
        "linhas": 1,
        "usuario_id": USUARIO_LOCAL.id,
    }


def test_ingestao_usa_usuario_autenticado(cliente, semente):
    usuario = Usuario(id="analista-42", nome="Joana Revisora")
    cliente.app.dependency_overrides[usuario_atual] = lambda: usuario
    try:
        assert _enviar(cliente, _csv(LINHA)).status_code == 201
    finally:
        cliente.app.dependency_overrides.pop(usuario_atual)
    assert semente.linha("SELECT quem FROM ingestoes")["quem"] == usuario.nome
    auditoria = semente.linha("SELECT * FROM auditoria")
    assert auditoria["quem"] == usuario.nome
    assert auditoria["detalhes"]["usuario_id"] == usuario.id


@pytest.mark.parametrize("rota", ["csv", "transacoes"])
def test_falha_depois_do_copy_desfaz_tudo(cliente, semente, monkeypatch, rota):
    auditar = ingestao._auditar

    def falhar(*args, **kwargs):
        auditar(*args, **kwargs)
        raise RuntimeError("Falha de auditoria simulada")

    monkeypatch.setattr(ingestao, "_auditar", falhar)
    with pytest.raises(RuntimeError, match="Falha de auditoria simulada"):
        if rota == "csv":
            _enviar(cliente, _csv(LINHA, LINHA))
        else:
            cliente.post("/ingestao/transacoes", json=TRANSACAO)
    assert _nada_gravado(semente)
