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

from api import dependencies
from api.dependencies import LOCAL_USER, DbConnection, get_current_user
from api.domain import alert_from_row, week_start
from fraudradar.config import get_settings

SUPABASE = "https://exemplo.supabase.co"
SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())


class _SigningKey:
    def __init__(self, key):
        self.key = key


class _FakeJwks:
    """Conjunto publicado com uma chave só, de kid "test"."""

    def __init__(self, error: Exception | None = None):
        self.error = error

    def get_jwk_set(self) -> dict[str, _SigningKey]:
        if self.error:
            raise self.error
        return {"test": _SigningKey(SIGNING_KEY.public_key())}


def _token(key=SIGNING_KEY, algorithm="ES256", kid="test", **overrides) -> str:
    claims = {
        "sub": "uuid-da-ana",
        "aud": "authenticated",
        "iss": f"{SUPABASE}/auth/v1",
        "exp": int(time.time()) + 600,
        "role": "authenticated",
        "is_anonymous": False,  # tokens reais do Supabase trazem o campo, mesmo falso
        "email": "ana@exemplo.com",
        "user_metadata": {"name": "Ana Analista"},
    }
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=algorithm, headers={"kid": kid})


@pytest.fixture
def supabase_auth(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    monkeypatch.setattr(dependencies, "_jwks", lambda url: _FakeJwks())


def _validate(token: str | None):
    if token is None:
        return get_current_user(None)
    return get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token))


def _http_status(token: str | None) -> int:
    with pytest.raises(HTTPException) as err:
        _validate(token)
    return err.value.status_code


# --- autenticação -----------------------------------------------------------------------


def test_valid_token_uses_profile_name(supabase_auth):
    user = _validate(_token())
    assert user.id == "uuid-da-ana"
    assert user.name == "Ana Analista"
    # Fallback para usuários já cadastrados com a chave antiga `nome`.
    assert _validate(_token(user_metadata={"nome": "Ana Legada"})).name == "Ana Legada"


def test_missing_profile_name_falls_back_to_email(supabase_auth):
    assert _validate(_token(user_metadata={"name": "  ", "nome": "  "})).name == "ana@exemplo.com"
    assert _validate(_token(user_metadata=None)).name == "ana@exemplo.com"


def test_trailing_slash_in_url_validates_issuer(supabase_auth, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE + "/")
    get_settings.cache_clear()
    assert _validate(_token()).name == "Ana Analista"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param(None, id="missing-token"),
        pytest.param("not-a-jwt", id="malformed"),
        pytest.param(_token(exp=int(time.time()) - 10), id="expired"),
        pytest.param(_token(exp=None), id="missing-exp"),
        pytest.param(_token(aud="anon"), id="wrong-audience"),
        pytest.param(_token(iss="https://other.supabase.co/auth/v1"), id="wrong-issuer"),
        pytest.param(_token(role="anon"), id="anon-role"),
        pytest.param(_token(is_anonymous=True), id="anonymous-login"),
        pytest.param(_token(kid="not-in-jwks"), id="unknown-kid"),
        pytest.param(_token(key=ec.generate_private_key(ec.SECP256R1())), id="wrong-signature"),
        pytest.param(
            _token(key="hmac-secret-with-more-than-32-bytes!!", algorithm="HS256"), id="hs256"
        ),
    ],
)
def test_rejected_token_returns_401(supabase_auth, token):
    assert _http_status(token) == 401


def test_unreachable_jwks_returns_503(supabase_auth, monkeypatch):
    error = jwt.PyJWKClientConnectionError("network down")
    monkeypatch.setattr(dependencies, "_jwks", lambda url: _FakeJwks(error))
    assert _http_status(_token()) == 503


def test_missing_supabase_url_returns_503(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "")
    get_settings.cache_clear()
    assert _http_status(_token()) == 503


def test_auth_disabled_skips_token(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "true")
    get_settings.cache_clear()
    assert _validate(None) == LOCAL_USER


class _JwksNetwork:
    """No lugar da rede do PyJWKClient de verdade: publica o JWKS, cai e conta as buscas."""

    def __init__(self):
        self.published = b""
        self.down = False
        self.fetches = 0
        self.now = 1_000.0  # relógio (time.monotonic) controlado pelo teste

    def publish(self, key, kid: str) -> None:
        pub = ECAlgorithm.to_jwk(key.public_key(), as_dict=True)
        jwk = {**pub, "kid": kid, "use": "sig", "alg": "ES256"}
        self.published = json.dumps({"keys": [jwk]}).encode()

    def open(self, req, timeout=None):
        self.fetches += 1
        if self.down:
            raise urllib.error.URLError("JWKS fora do ar")
        return io.BytesIO(self.published)


@pytest.fixture
def jwks_network(monkeypatch) -> _JwksNetwork:
    """PyJWKClient de verdade com rede e relógio falsos (a supabase_auth troca o cliente todo)."""
    monkeypatch.setenv("SUPABASE_URL", SUPABASE)
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    network = _JwksNetwork()
    monkeypatch.setattr(urllib.request, "build_opener", lambda *handlers: network)
    monkeypatch.setattr(time, "monotonic", lambda: network.now)
    jwk_client = dependencies._jwks.__wrapped__(SUPABASE)
    monkeypatch.setattr(dependencies, "_jwks", lambda url: jwk_client)
    return network


def test_removed_key_from_jwks_expires(jwks_network):
    """Chave revogada no Supabase some do JWKS e, vencido o cache do conjunto, não autentica."""
    old_key, new_key = (
        ec.generate_private_key(ec.SECP256R1()),
        ec.generate_private_key(ec.SECP256R1()),
    )
    jwks_network.publish(old_key, "old")
    assert _validate(_token(key=old_key, kid="old")).id == "uuid-da-ana"
    jwks_network.publish(new_key, "new")
    jwks_network.now += 601  # venceu o cache do conjunto (600 s)
    assert _validate(_token(key=new_key, kid="new")).id == "uuid-da-ana"
    assert _http_status(_token(key=old_key, kid="old")) == 401


def test_unknown_kid_does_not_trigger_jwks_fetch(jwks_network):
    """Com o Supabase fora do ar, kid inventado não pode virar uma busca por requisição."""
    jwks_network.publish(SIGNING_KEY, "test")
    assert _validate(_token()).id == "uuid-da-ana"
    jwks_network.down = True
    jwks_network.now += 31  # passou o intervalo mínimo entre buscas; o conjunto segue em cache
    for _ in range(3):
        assert _http_status(_token(kid="invented")) == 401
    assert jwks_network.fetches == 1
    assert _validate(_token()).id == "uuid-da-ana"  # chave conhecida continua entrando


def test_jwks_points_to_project():
    jwk_client = dependencies._jwks.__wrapped__(SUPABASE)
    assert jwk_client.uri == f"{SUPABASE}/auth/v1/.well-known/jwks.json"


def test_routes_require_session_except_health(supabase_auth, db):
    from api.main import create_app

    api = TestClient(create_app())
    assert api.post("/chat", json={}).status_code == 401
    assert api.get("/ingestion/connections").status_code == 401
    assert api.get("/health").status_code == 200
    headers = {"Authorization": f"Bearer {_token()}"}
    assert api.get("/ingestion/connections", headers=headers).status_code == 200


# --- transação por requisição -------------------------------------------------------------


@pytest.fixture
def tx_app(db) -> TestClient:
    app = FastAPI()

    def _write(conn) -> None:
        conn.execute(text("INSERT INTO audit_log (actor, action) VALUES ('test', 'write')"))

    @app.post("/ok")
    def ok(conn: DbConnection) -> dict:
        _write(conn)
        return {}

    @app.post("/fail")
    def fail(conn: DbConnection) -> dict:
        _write(conn)
        raise HTTPException(409, "conflito")

    @app.get("/timeout")
    def timeout(conn: DbConnection) -> dict:
        return {"value": conn.execute(text("SHOW statement_timeout")).scalar()}

    return TestClient(app)


def test_completed_route_commits(tx_app, seed):
    assert tx_app.post("/ok").status_code == 200
    assert seed.count("audit_log") == 1


def test_raising_route_rolls_back(tx_app, seed):
    assert tx_app.post("/fail").status_code == 409
    assert seed.count("audit_log") == 0


def test_query_has_statement_timeout(tx_app):
    assert tx_app.get("/timeout").json() == {"value": "15s"}


# --- tradução banco -> front ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("db_status", "front_status"),
    [
        ("new", "pending"),
        ("in_review", "pending"),
        ("escalated", "escalated"),
        ("archived", "archived"),
        ("reported", "reported"),
    ],
)
def test_db_status_maps_to_front_status(seed, db, db_status, front_status):
    alert_id = seed.alert(4242, date(2023, 1, 2), status=db_status)
    assert _load_alert(db, alert_id).status == front_status


def test_alert_from_row_converts_fields(seed, db):
    alert_id = seed.alert(
        1234567890,
        date(2023, 1, 2),
        score=0.9,  # REAL: volta como 0.899999976...
        position=7,
        countries=("UAE", "UK"),
        typology=None,
        total_amount=1500.5,
        transaction_count=7,
    )
    alert = _load_alert(db, alert_id)
    assert alert.id == str(alert_id)
    assert alert.account == "1234567890"
    assert alert.score == 90.0
    assert alert.queue_position == 7
    assert alert.country == "UAE"
    assert alert.typology == "Indefinida"
    assert (alert.amount, alert.transaction_count) == (1500.5, 7)


def test_alert_without_country(seed, db):
    assert _load_alert(db, seed.alert(77, date(2023, 1, 2), countries=())).country == "Indefinido"


def _load_alert(db, alert_id):
    from api.domain import ALERT_COLUMNS

    with db.connect() as conn:
        sql = f"SELECT {ALERT_COLUMNS} FROM alerts a WHERE a.id = :id"
        return alert_from_row(conn.execute(text(sql), {"id": alert_id}).mappings().one())


@pytest.mark.parametrize("day", range(2, 9))
def test_week_start(day):
    assert week_start(date(2023, 1, day)) == date(2023, 1, 2)


# --- stubs de IA e ingestão --------------------------------------------------------------------


def test_assessment_generates_persists_and_returns_in_detail(client, seed, monkeypatch, db):
    """Test the real HTTP and PostgreSQL persistence contract."""
    from sqlalchemy import text

    from api.routes import ai
    from api.schemas.alerts import Assessment, Source
    from api.schemas.chat import ChatResponse

    alert_id = seed.alert(55, date(2023, 1, 2))

    simulated_assessment = Assessment(
        content=(
            "Os sinais financeiros justificam "
            "diligencia adicional [F1]. "
            "A decisao permanece com o analista."
        ),
        sources=[
            Source(
                title="[F1] Art. 10 - Fonte juridica",
                excerpt=("Fonte revisada de teste. Fonte oficial: https://www.planalto.gov.br/"),
            )
        ],
    )

    calls = []

    def simulated_generation(
        prompt, *, retrieval_query=None, system_instruction, max_output_tokens
    ):
        calls.append((prompt, retrieval_query))
        return ChatResponse(
            kind="legal",
            answer=simulated_assessment.content + "\nTipologia sugerida: fan_out",
            sources=simulated_assessment.sources,
        )

    monkeypatch.setattr(
        ai,
        "answer_legal_chat",
        simulated_generation,
    )

    monkeypatch.setattr(
        ai,
        "gemini_settings",
        lambda: ("gemini-3.5-flash-lite", "chave-de-teste"),
    )

    # O alerta inexistente falha depois da configuração e antes de chamar o LLM.
    missing = client.post("/alerts/999/assessment")
    assert missing.status_code == 404, missing.text

    response = client.post(f"/alerts/{alert_id}/assessment")

    assert response.status_code == 200, response.text
    assert response.json() == simulated_assessment.model_dump()
    assert len(calls) == 1

    with db.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                SELECT
                    content,
                    sources,
                    validation,
                    is_valid,
                    llm_model,
                    suggested_typology
                FROM assessments
                WHERE alert_id = :alert_id
                """
                ),
                {"alert_id": alert_id},
            )
            .mappings()
            .one()
        )

    assert row["content"] == simulated_assessment.content
    assert row["is_valid"] is True
    assert row["llm_model"] == "gemini-3.5-flash-lite"
    assert row["suggested_typology"] == "fan_out"
    assert row["validation"]["requires_human_review"] is True
    assert row["validation"]["legal_conclusion_verified"] is False
    assert len(row["sources"]) == 1

    assert seed.row(
        "SELECT typology FROM alerts WHERE id = :id",
        id=alert_id,
    ) == {"typology": "Fan-out"}
    audit = seed.row(
        "SELECT actor, action, entity, entity_id, details FROM audit_log"
        " WHERE action = 'assessment_generated'",
    )
    assert audit["actor"] == LOCAL_USER.name
    assert audit["entity"] == "alert"
    assert audit["entity_id"] == str(alert_id)
    assert audit["details"] == {
        "assessment_id": seed.row(
            "SELECT id FROM assessments WHERE alert_id = :id",
            id=alert_id,
        )["id"],
        "llm_model": "gemini-3.5-flash-lite",
        "suggested_typology": "fan_out",
        "user_id": LOCAL_USER.id,
    }

    detail = client.get(f"/alerts/{alert_id}")

    assert detail.status_code == 200, detail.text
    assert detail.json()["assessment"] == simulated_assessment.model_dump()


def test_chat_validates_request_and_only_legal_questions_need_llm(client):
    req = {"message": "Oi", "context": {"page": "/dashboard", "week": "2023-01-02"}}
    greeting = client.post("/chat", json={**req, "history": []})
    assert greeting.status_code == 200
    assert greeting.json()["sources"] == []
    legal = {**req, "message": "O que exige o Art. 11?", "history": []}
    assert client.post("/chat", json=legal).status_code == 503
    empty = {**req, "message": "  ", "history": []}
    assert client.post("/chat", json=empty).status_code == 422


def test_postgres_connections_start_empty_and_validate_the_body(client):
    assert client.get("/ingestion/connections").json() == {"items": []}
    assert client.post("/ingestion/connections", json={}).status_code == 422
    assert client.post("/ingestion/connections/1/test").status_code == 404


# --- a própria semente (os executores dependem dela) --------------------------------------------


def test_seed_creates_consistent_row_graph(seed):
    alert_id = seed.alert(10, date(2023, 1, 2))
    seed.evidence(alert_id, contributions={"targets_7d": 0.8}, rules=[{"code": "R-1"}])
    assessment_id = seed.assessment(alert_id)
    decision_id = seed.decision(alert_id, assessment_id=assessment_id)
    seed.report(alert_id, decision_id)
    seed.report(alert_id, decision_id, approved_by="Ana")
    seed.transaction(10, 20, datetime(2023, 1, 3, 10), label=1, typology="Fan_Out")
    seed.batch(date(2023, 1, 2), metrics={"recall": 0.5}, released=True)
    assert seed.count("reports", "status = 'approved' AND approved_at IS NOT NULL") == 1
    assert seed.count("ground_truth") == 1
    assert seed.row("SELECT released_at IS NOT NULL AS ok FROM weekly_batches") == {"ok": True}
