"""Offline HTTP tests for contextual assessment generation.

No database, no external provider, no credentials.
"""

from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from api.dependencies import LOCAL_USER, get_current_user
from api.errors import AppError
from api.main import create_app
from api.routes import ai
from api.schemas.alerts import Assessment, Source


class FakeEngine:
    def __init__(self):
        self.active = False
        self.transactions = 0
        self.events = []

    @contextmanager
    def begin(self):
        assert not self.active
        self.active = True
        self.transactions += 1
        self.events.append("begin")

        try:
            yield object()
        finally:
            self.events.append("close")
            self.active = False


def valid_assessment():
    return Assessment(
        content=(
            "O alerta apresenta sinais de risco [F1]. "
            "A revisao humana e necessaria."
        ),
        sources=[
            Source(
                title="[F1] Art. 10 - Fonte juridica",
                excerpt=(
                    "Evidencia revisada. "
                    "Fonte oficial: https://www.planalto.gov.br/"
                ),
            )
        ],
    )


@pytest.fixture
def setup_http(monkeypatch):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: LOCAL_USER

    engine = FakeEngine()
    state = {
        "prepared": SimpleNamespace(context={}, forbidden_identifiers=()),
        "assessment": valid_assessment(),
        "saved": [],
        "generated": 0,
    }

    monkeypatch.setattr(
        ai,
        "get_engine",
        lambda: engine,
    )

    monkeypatch.setattr(
        ai,
        "get_settings",
        lambda: SimpleNamespace(
            llm_model="gemini-3.5-flash-lite"
        ),
    )

    monkeypatch.setattr(
        ai,
        "_set_timeout",
        lambda conn: None,
    )

    monkeypatch.setattr(
        ai,
        "_set_dataset",
        lambda conn, slug: engine.events.append(
            "dataset:" + slug
        ),
    )

    def prepare(conn, alert_id):
        assert engine.active
        assert alert_id == 882
        engine.events.append("prepare")
        return state["prepared"]

    def generate(prepared):
        assert not engine.active
        assert prepared is state["prepared"]
        state["generated"] += 1
        engine.events.append("generate")
        return state["assessment"]

    def check_alert(conn, alert_id):
        assert engine.active
        assert alert_id == 882
        engine.events.append("recheck")
        return {"id": alert_id}

    def save(conn, *, alert_id, assessment, model):
        assert engine.active
        assert alert_id == 882
        assert model == "gemini-3.5-flash-lite"
        assert assessment is state["assessment"]

        state["saved"].append(alert_id)
        engine.events.append("save")
        return 42

    monkeypatch.setattr(ai, "prepare_alert_ai", prepare)
    monkeypatch.setattr(ai, "generate_alert_assessment", generate)
    monkeypatch.setattr(ai, "get_alert_row", check_alert)
    monkeypatch.setattr(ai, "save_generated_assessment", save)

    try:
        with TestClient(app) as client:
            yield client, engine, state
    finally:
        app.dependency_overrides.clear()


def test_http_200_generates_and_persists(setup_http):
    client, engine, state = setup_http

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 200, response.text

    payload = response.json()

    assert "[F1]" in payload["content"]
    assert len(payload["sources"]) == 1
    assert state["generated"] == 1
    assert state["saved"] == [882]
    assert engine.transactions == 2


def test_read_transaction_closes_before_generation(setup_http):
    client, engine, state = setup_http

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 200

    events = engine.events

    assert events.index("prepare") < events.index("close")
    assert events.index("close") < events.index("generate")
    assert events.index("generate") < events.index("recheck")
    assert events.index("recheck") < events.index("save")

    assert not engine.active


def test_dataset_header_is_applied_to_both_transactions(
    setup_http,
):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/assessment",
        headers={"X-Dataset": "saml-d"},
    )

    assert response.status_code == 200

    assert engine.events.count("dataset:saml-d") == 2


def test_invalid_generated_answer_is_not_saved(setup_http):
    client, engine, state = setup_http

    state["assessment"].content = "Sem citacoes juridicas."

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 502
    assert response.json()["code"] == "ai.invalid_assessment"

    assert state["generated"] == 1
    assert state["saved"] == []
    assert engine.transactions == 1
    assert not engine.active


def test_provider_fallback_is_not_saved(setup_http):
    client, engine, state = setup_http

    state["assessment"].content = (
        "A explicacao automatica esta temporariamente "
        "indisponivel. Nenhuma conclusao automatica "
        "foi produzida. [F1]"
    )

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 503
    assert response.json()["code"] == "ai.provider_unavailable"

    assert state["saved"] == []
    assert engine.transactions == 1


def test_missing_alert_returns_404_before_generation(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    def missing_alert(conn, alert_id):
        raise AppError(
            404,
            "alert.not_found",
            "Alerta nao encontrado.",
        )

    monkeypatch.setattr(ai, "prepare_alert_ai", missing_alert)

    response = client.post("/alerts/999/assessment")

    assert response.status_code == 404
    assert response.json()["code"] == "alert.not_found"
    assert state["generated"] == 0
    assert state["saved"] == []
    assert engine.transactions == 1


def test_invalid_alert_id_returns_422(setup_http):
    client, engine, state = setup_http

    response = client.post("/alerts/abc/assessment")

    assert response.status_code == 422
    assert engine.transactions == 0
    assert state["generated"] == 0


def test_generation_value_error_returns_502(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    def invalid_generation(prepared):
        assert not engine.active
        raise ValueError("Resultado invalido de teste.")

    monkeypatch.setattr(
        ai,
        "generate_alert_assessment",
        invalid_generation,
    )

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 502
    assert response.json()["code"] == "ai.invalid_assessment"
    assert state["saved"] == []
    assert engine.transactions == 1