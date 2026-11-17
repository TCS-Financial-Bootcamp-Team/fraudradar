"""Testes HTTP offline da geração de parecer contextual."""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from api.dependencies import LOCAL_USER, get_current_user
from api.errors import AppError
from api.main import create_app
from api.routes import ai
from api.schemas.alerts import Source
from api.schemas.chat import ChatResponse
from fraudradar.ai.alert_assessment import AlertContextBlockedError, PreparedAlertAI
from fraudradar.ai.legal_chat_adapter import LLM_UNAVAILABLE_ANSWER
from fraudradar.ai.legal_generation import LegalLlmNotConfiguredError


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


def prepared_alert():
    return PreparedAlertAI(
        context={
            "period_start": "2023-06-19",
            "country": "UK",
            "risk_score_0_to_100": 91.5,
            "financial_volume_gbp": 35102.0,
            "transaction_count": 2,
            "queue_position": 2,
            "alert_origin": "model",
            "model_contributions": [],
            "triggered_rules": [],
            "payment_methods": [],
        },
        forbidden_identifiers=("8865018891",),
    )


def generated_answer(content=None):
    return ChatResponse(
        kind="legal",
        answer=content
        or (
            "O alerta apresenta sinais de risco [F1]. "
            "A revisão humana é necessária.\n"
            "Tipologia sugerida: fan_out"
        ),
        sources=[
            Source(
                title="[F1] Art. 10 - Fonte jurídica",
                excerpt=("Evidência revisada. Fonte oficial: https://www.planalto.gov.br/"),
            )
        ],
    )


@pytest.fixture
def setup_http(monkeypatch):
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: LOCAL_USER
    engine = FakeEngine()
    state = {
        "prepared": prepared_alert(),
        "generated": generated_answer(),
        "saved": [],
        "queries": [],
    }

    monkeypatch.setattr(ai, "get_engine", lambda: engine)
    monkeypatch.setattr(
        ai,
        "gemini_settings",
        lambda: ("gemini-3.5-flash-lite", "chave-de-teste"),
    )
    monkeypatch.setattr(ai, "_set_timeout", lambda conn: None)
    monkeypatch.setattr(
        ai,
        "_set_dataset",
        lambda conn, slug: engine.events.append("dataset:" + slug),
    )

    def prepare(conn, alert_id):
        assert engine.active
        assert alert_id == 882
        engine.events.append("prepare")
        return state["prepared"]

    def generate(prompt, *, retrieval_query=None, system_instruction, max_output_tokens):
        assert not engine.active
        assert "## Resumo" in system_instruction
        assert max_output_tokens == 1500
        state["queries"].append(retrieval_query)
        engine.events.append("generate")
        return state["generated"]

    def check_alert(conn, alert_id):
        assert engine.active
        engine.events.append("recheck")
        return {"id": alert_id}

    def save(
        conn,
        *,
        alert_id,
        assessment,
        model,
        suggested_typology,
        user,
    ):
        assert engine.active
        state["saved"].append(
            {
                "alert_id": alert_id,
                "content": assessment.content,
                "model": model,
                "suggested_typology": suggested_typology,
                "user": user,
            }
        )
        engine.events.append("save")
        return 42

    monkeypatch.setattr(ai, "prepare_alert_ai", prepare)
    monkeypatch.setattr(ai, "answer_legal_chat", generate)
    monkeypatch.setattr(ai, "get_alert_row", check_alert)
    monkeypatch.setattr(ai, "save_generated_assessment", save)

    try:
        with TestClient(app) as client:
            yield client, engine, state
    finally:
        app.dependency_overrides.clear()


def test_http_generates_parses_persists_and_returns_draft(setup_http):
    client, engine, state = setup_http
    response = client.post("/alerts/882/assessment")

    assert response.status_code == 200, response.text
    assert response.json()["content"].endswith("A revisão humana é necessária.")
    assert "Tipologia sugerida" not in response.json()["content"]
    assert response.json()["summary"] == response.json()["content"]
    assert state["saved"] == [
        {
            "alert_id": 882,
            "content": response.json()["content"],
            "model": "gemini-3.5-flash-lite",
            "suggested_typology": "fan_out",
            "user": LOCAL_USER,
        }
    ]
    assert "deveres das instituições financeiras" in state["queries"][0]
    assert engine.transactions == 2


def test_http_response_extracts_structured_summary(setup_http):
    client, _, state = setup_http
    state["generated"] = generated_answer(
        "## Resumo\nRisco alto: 91,5. Verifique as contrapartes.\n\n"
        "## Fundamentação jurídica\n- Diligência adicional [F1].\nTipologia sugerida: fan_out"
    )
    response = client.post("/alerts/882/assessment")
    assert response.status_code == 200
    assert response.json()["summary"] == "Risco alto: 91,5. Verifique as contrapartes."


def test_read_transaction_closes_before_generation(setup_http):
    client, engine, _ = setup_http
    assert client.post("/alerts/882/assessment").status_code == 200
    assert engine.events == [
        "begin",
        "dataset:saml-d",
        "prepare",
        "close",
        "generate",
        "begin",
        "dataset:saml-d",
        "recheck",
        "save",
        "close",
    ]


def test_configuration_failure_happens_before_database(setup_http, monkeypatch):
    client, engine, state = setup_http

    def missing_settings():
        raise LegalLlmNotConfiguredError("Sem chave.")

    monkeypatch.setattr(ai, "gemini_settings", missing_settings)
    response = client.post("/alerts/882/assessment")
    assert response.status_code == 503
    assert response.json()["code"] == "ai.not_configured"
    assert response.json()["detail"] == (
        "A IA não está configurada na API (defina LLM_MODEL e a chave do Gemini)."
    )
    assert engine.transactions == 0
    assert state["saved"] == []


def test_context_guard_returns_stable_error(setup_http, monkeypatch):
    client, engine, _ = setup_http

    def blocked(conn, alert_id):
        raise AlertContextBlockedError("vazamento")

    monkeypatch.setattr(ai, "prepare_alert_ai", blocked)
    response = client.post("/alerts/882/assessment")
    assert response.status_code == 500
    assert response.json()["code"] == "ai.context_blocked"
    assert engine.transactions == 1


def test_invalid_generated_assessment_is_not_saved(setup_http):
    client, engine, state = setup_http
    state["generated"] = generated_answer("Sem citações jurídicas.")
    response = client.post("/alerts/882/assessment")
    assert response.status_code == 502
    assert response.json()["code"] == "ai.invalid_assessment"
    assert state["saved"] == []
    assert engine.transactions == 1


def test_llm_unavailable_assessment_returns_503_without_saving(setup_http):
    client, engine, state = setup_http
    state["generated"] = generated_answer(LLM_UNAVAILABLE_ANSWER)

    response = client.post("/alerts/882/assessment")

    assert response.status_code == 503
    assert response.json()["code"] == "ai.provider_unavailable"
    assert state["saved"] == []
    assert engine.transactions == 1


def test_context_preparation_bug_is_not_reported_as_privacy_block(setup_http, monkeypatch):
    client, _, _ = setup_http

    def broken_context(conn, alert_id):
        raise ValueError("defeito real")

    monkeypatch.setattr(ai, "prepare_alert_ai", broken_context)
    with pytest.raises(ValueError, match="defeito real"):
        client.post("/alerts/882/assessment")


def test_missing_alert_returns_404_before_generation(setup_http, monkeypatch):
    client, engine, state = setup_http

    def missing_alert(conn, alert_id):
        raise AppError(404, "alert.not_found", "Alerta não encontrado.")

    monkeypatch.setattr(ai, "prepare_alert_ai", missing_alert)
    response = client.post("/alerts/999/assessment")
    assert response.status_code == 404
    assert response.json()["code"] == "alert.not_found"
    assert state["queries"] == []
    assert engine.transactions == 1


def test_invalid_alert_id_returns_422_without_database(setup_http):
    client, engine, _ = setup_http
    response = client.post("/alerts/abc/assessment")
    assert response.status_code == 422
    assert engine.transactions == 0
