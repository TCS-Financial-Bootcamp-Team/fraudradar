"""Fundação da API: autenticação, transação por requisição, tradução de alertas e stubs."""

import io
import json
import time
import urllib.error
import urllib.request
from datetime import date, datetime

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from jwt.algorithms import ECAlgorithm
from sqlalchemy import text

from api import dependencias
from api.dependencias import USUARIO_LOCAL, Conexao, usuario_atual
from api.dominio import alerta_de_linha, segunda_feira
from fraudradar.config import get_settings

SUPABASE = "https://exemplo.supabase.co"
CHAVE = ec.generate_private_key(ec.SECP256R1())


class _ChaveAssinatura:
    def __init__(self, chave):
        self.key = chave


class _JwksFalso:
    """Conjunto publicado com uma chave só, de kid "teste"."""

    def __init__(self, erro: Exception | None = None):
        self.erro = erro

    def get_jwk_set(self) -> dict[str, _ChaveAssinatura]:
        if self.erro:
            raise self.erro
        return {"teste": _ChaveAssinatura(CHAVE.public_key())}


def _token(chave=CHAVE, algoritmo="ES256", kid="teste", **mudancas) -> str:
    claims = {
        "sub": "uuid-da-ana",
        "aud": "authenticated",
        "iss": f"{SUPABASE}/auth/v1",
        "exp": int(time.time()) + 600,
        "role": "authenticated",
        "is_anonymous": False,  # tokens reais do Supabase trazem o campo, mesmo falso
        "email": "ana@exemplo.com",
        "user_metadata": {"nome": "Ana Analista"},
    }
    claims.update(mudancas)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, chave, algorithm=algoritmo, headers={"kid": kid})


@pytest.fixture
def auth_supabase(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    monkeypatch.setenv("AUTH_DESLIGADA", "false")
    get_settings.cache_clear()
    monkeypatch.setattr(dependencias, "_jwks", lambda url: _JwksFalso())


def _validar(token: str | None):
    if token is None:
        return usuario_atual(None)
    return usuario_atual(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))


def _status_http(token: str | None) -> int:
    with pytest.raises(HTTPException) as erro:
        _validar(token)
    return erro.value.status_code


# --- autenticação -----------------------------------------------------------------------


def test_token_valido_usa_nome_do_perfil(auth_supabase):
    usuario = _validar(_token())
    assert usuario.id == "uuid-da-ana"
    assert usuario.nome == "Ana Analista"


def test_sem_nome_no_perfil_usa_email(auth_supabase):
    assert _validar(_token(user_metadata={"nome": "  "})).nome == "ana@exemplo.com"
    assert _validar(_token(user_metadata=None)).nome == "ana@exemplo.com"


def test_url_com_barra_final_valida_o_emissor(auth_supabase, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE + "/")
    get_settings.cache_clear()
    assert _validar(_token()).nome == "Ana Analista"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(None, id="sem-token"),
        pytest.param("nao-e-um-jwt", id="malformado"),
        pytest.param(_token(exp=int(time.time()) - 10), id="expirado"),
        pytest.param(_token(exp=None), id="sem-exp"),
        pytest.param(_token(aud="anon"), id="audiencia-errada"),
        pytest.param(_token(iss="https://outro.supabase.co/auth/v1"), id="emissor-errado"),
        pytest.param(_token(role="anon"), id="papel-anon"),
        pytest.param(_token(is_anonymous=True), id="login-anonimo"),
        pytest.param(_token(kid="fora-do-jwks"), id="kid-desconhecido"),
        pytest.param(_token(chave=ec.generate_private_key(ec.SECP256R1())), id="assinatura-errada"),
        pytest.param(
            _token(chave="segredo-hmac-com-mais-de-32-bytes!!", algoritmo="HS256"), id="hs256"
        ),
    ],
)
def test_token_recusado_401(auth_supabase, token):
    assert _status_http(token) == 401


def test_jwks_fora_do_ar_503(auth_supabase, monkeypatch):
    erro = jwt.PyJWKClientConnectionError("sem rede")
    monkeypatch.setattr(dependencias, "_jwks", lambda url: _JwksFalso(erro))
    assert _status_http(_token()) == 503


def test_sem_supabase_url_503(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "")
    get_settings.cache_clear()
    assert _status_http(_token()) == 503


def test_auth_desligada_dispensa_token(monkeypatch):
    monkeypatch.setenv("AUTH_DESLIGADA", "true")
    get_settings.cache_clear()
    assert _validar(None) == USUARIO_LOCAL


class _RedeJwks:
    """No lugar da rede do PyJWKClient de verdade: publica o JWKS, cai e conta as buscas."""

    def __init__(self):
        self.publicado = b""
        self.fora_do_ar = False
        self.buscas = 0
        self.agora = 1_000.0  # relógio (time.monotonic) controlado pelo teste

    def publicar(self, chave, kid: str) -> None:
        publica = ECAlgorithm.to_jwk(chave.public_key(), as_dict=True)
        jwk = {**publica, "kid": kid, "use": "sig", "alg": "ES256"}
        self.publicado = json.dumps({"keys": [jwk]}).encode()

    def open(self, pedido, timeout=None):
        self.buscas += 1
        if self.fora_do_ar:
            raise urllib.error.URLError("JWKS fora do ar")
        return io.BytesIO(self.publicado)


@pytest.fixture
def rede_jwks(monkeypatch) -> _RedeJwks:
    """PyJWKClient de verdade com rede e relógio falsos (a auth_supabase troca o cliente todo)."""
    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    monkeypatch.setenv("AUTH_DESLIGADA", "false")
    get_settings.cache_clear()
    rede = _RedeJwks()
    monkeypatch.setattr(urllib.request, "build_opener", lambda *handlers: rede)
    monkeypatch.setattr(time, "monotonic", lambda: rede.agora)
    cliente = dependencias._jwks.__wrapped__(SUPABASE)
    monkeypatch.setattr(dependencias, "_jwks", lambda url: cliente)
    return rede


def test_chave_retirada_do_jwks_deixa_de_valer(rede_jwks):
    """Chave revogada no Supabase some do JWKS e, vencido o cache do conjunto, não autentica."""
    antiga, nova = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    rede_jwks.publicar(antiga, "antiga")
    assert _validar(_token(chave=antiga, kid="antiga")).id == "uuid-da-ana"
    rede_jwks.publicar(nova, "nova")
    rede_jwks.agora += 601  # venceu o cache do conjunto (600 s)
    assert _validar(_token(chave=nova, kid="nova")).id == "uuid-da-ana"
    assert _status_http(_token(chave=antiga, kid="antiga")) == 401


def test_kid_inventado_nao_dispara_busca_do_jwks(rede_jwks):
    """Com o Supabase fora do ar, kid inventado não pode virar uma busca por requisição."""
    rede_jwks.publicar(CHAVE, "teste")
    assert _validar(_token()).id == "uuid-da-ana"
    rede_jwks.fora_do_ar = True
    rede_jwks.agora += 31  # passou o intervalo mínimo entre buscas; o conjunto segue em cache
    for _ in range(3):
        assert _status_http(_token(kid="inventado")) == 401
    assert rede_jwks.buscas == 1
    assert _validar(_token()).id == "uuid-da-ana"  # chave conhecida continua entrando


def test_jwks_aponta_para_o_projeto():
    cliente = dependencias._jwks.__wrapped__(SUPABASE)
    assert cliente.uri == f"{SUPABASE}/auth/v1/.well-known/jwks.json"


def test_rotas_exigem_sessao_mas_saude_nao(auth_supabase):
    from api.main import criar_app

    api = TestClient(criar_app())
    assert api.post("/chat", json={}).status_code == 401
    assert api.get("/ingestao/conexoes").status_code == 401
    assert api.get("/saude").status_code == 200
    cabecalho = {"Authorization": f"Bearer {_token()}"}
    assert api.get("/ingestao/conexoes", headers=cabecalho).status_code == 200


# --- transação por requisição -------------------------------------------------------------


@pytest.fixture
def app_transacao(banco) -> TestClient:
    app = FastAPI()

    def _gravar(conn) -> None:
        conn.execute(text("INSERT INTO auditoria (quem, acao) VALUES ('teste', 'gravar')"))

    @app.post("/ok")
    def ok(conn: Conexao) -> dict:
        _gravar(conn)
        return {}

    @app.post("/falha")
    def falha(conn: Conexao) -> dict:
        _gravar(conn)
        raise HTTPException(409, "conflito")

    @app.get("/timeout")
    def timeout(conn: Conexao) -> dict:
        return {"valor": conn.execute(text("SHOW statement_timeout")).scalar()}

    return TestClient(app)


def test_rota_que_termina_grava(app_transacao, semente):
    assert app_transacao.post("/ok").status_code == 200
    assert semente.contar("auditoria") == 1


def test_rota_que_levanta_desfaz_tudo(app_transacao, semente):
    assert app_transacao.post("/falha").status_code == 409
    assert semente.contar("auditoria") == 0


def test_consulta_tem_limite_de_tempo(app_transacao):
    assert app_transacao.get("/timeout").json() == {"valor": "15s"}


# --- tradução banco -> front ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("banco_status", "front_status"),
    [
        ("novo", "pendente"),
        ("em_analise", "pendente"),
        ("aprofundado", "aprofundar"),
        ("arquivado", "arquivado"),
        ("comunicado", "comunicar"),
    ],
)
def test_status_do_banco_vira_status_do_front(semente, banco, banco_status, front_status):
    alerta_id = semente.alerta(4242, date(2023, 1, 2), status=banco_status)
    assert _alerta(banco, alerta_id).status == front_status


def test_alerta_de_linha_converte_campos(semente, banco):
    alerta_id = semente.alerta(
        1234567890,
        date(2023, 1, 2),
        score=0.9,  # REAL: volta como 0.899999976...
        paises=("UAE", "UK"),
        tipologia=None,
        valor_total=1500.5,
        qtd_transacoes=7,
    )
    alerta = _alerta(banco, alerta_id)
    assert alerta.id == str(alerta_id)
    assert alerta.conta == "1234567890"
    assert alerta.score == 90.0
    assert alerta.pais == "UAE"
    assert alerta.tipologia == "Indefinida"
    assert (alerta.valor, alerta.transacoes) == (1500.5, 7)


def test_alerta_sem_pais(semente, banco):
    assert _alerta(banco, semente.alerta(77, date(2023, 1, 2), paises=())).pais == "Indefinido"


def _alerta(banco, alerta_id):
    from api.dominio import COLUNAS_ALERTA

    with banco.connect() as conn:
        sql = f"SELECT {COLUNAS_ALERTA} FROM alertas a WHERE a.id = :id"
        return alerta_de_linha(conn.execute(text(sql), {"id": alerta_id}).mappings().one())


@pytest.mark.parametrize("dia", range(2, 9))
def test_segunda_feira(dia):
    assert segunda_feira(date(2023, 1, dia)) == date(2023, 1, 2)


# --- stubs de IA e ingestão --------------------------------------------------------------------


def test_parecer_confere_alerta_antes_de_responder_503(cliente, semente):
    alerta_id = semente.alerta(55, date(2023, 1, 2))
    assert cliente.post("/alertas/999/parecer").status_code == 404
    assert cliente.post(f"/alertas/{alerta_id}/parecer").status_code == 503


def test_chat_valida_pedido_e_responde_503(cliente):
    pedido = {"mensagem": "Oi", "contexto": {"pagina": "/dashboard", "semana": "2023-01-02"}}
    assert cliente.post("/chat", json={**pedido, "historico": []}).status_code == 503
    vazio = {**pedido, "mensagem": "  ", "historico": []}
    assert cliente.post("/chat", json=vazio).status_code == 422


def test_fontes_postgres_lista_vazia_e_cadastro_501(cliente):
    assert cliente.get("/ingestao/conexoes").json() == {"itens": []}
    assert cliente.post("/ingestao/conexoes").status_code == 501
    assert cliente.post("/ingestao/conexoes/1/sincronizar").status_code == 501


# --- a própria semente (os executores dependem dela) --------------------------------------------


def test_semente_cria_o_grafo_de_linhas_coerente(semente):
    alerta_id = semente.alerta(10, date(2023, 1, 2))
    semente.evidencias(alerta_id, contribuicoes={"destinos_7d": 0.8}, regras=[{"codigo": "R-1"}])
    parecer_id = semente.parecer(alerta_id)
    decisao_id = semente.decisao(alerta_id, parecer_id=parecer_id)
    semente.comunicacao(alerta_id, decisao_id)
    semente.comunicacao(alerta_id, decisao_id, aprovada_por="Ana")
    semente.transacao(10, 20, datetime(2023, 1, 3, 10), rotulo=1, tipologia="Fan_Out")
    semente.lote(date(2023, 1, 2), metricas={"recall": 0.5}, liberada=True)
    assert semente.contar("comunicacoes", "status = 'aprovada' AND aprovado_em IS NOT NULL") == 1
    assert semente.contar("avaliacao") == 1
    assert semente.linha("SELECT liberada_em IS NOT NULL AS ok FROM lotes_semana") == {"ok": True}
