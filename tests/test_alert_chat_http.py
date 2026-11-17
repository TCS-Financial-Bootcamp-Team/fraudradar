"""Offline HTTP tests for the contextual alert assistant.

No external Gemini call or real database connection.
"""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from api import alert_ai_service
from api.alert_ai_service import PreparedAlertAI
from api.dependencies import LOCAL_USER, get_current_user
from api.errors import AppError
from api.legal_chat_service import LegalEvidenceUnavailableError
from api.main import create_app
from api.routes import ai
from api.schemas.alerts import Source
from api.schemas.chat import ChatResponse


class FakeEngine:
    def __init__(self):
        self.active = False
        self.events = []
        self.transactions = 0

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


def request_payload(
    message="Quais diligencias sao recomendadas?",
    alert_id="882",
):
    return {
        "message": message,
        "context": {
            "page": "/alerts/882",
            "week": "2023-06-19",
            "alert_id": alert_id,
        },
        "history": [],
    }


def prepared_alert():
    return PreparedAlertAI(
        context={
            "analysis_type": "alert_review",
            "period_start": "2023-06-19",
            "country": "UK",
            "typology": "Fan-out",
            "risk_score_0_to_100": 91.5,
            "financial_volume_gbp": 35102.0,
            "transaction_count": 2,
            "queue_position": 2,
            "alert_origin": "model",
            "model_contributions": [
                {
                    "feature": "Numero de contrapartes",
                    "positive_contribution_pct": 70.0,
                }
            ],
            "triggered_rules": [
                {
                    "code": "R-014",
                    "description": "Multiplos destinatarios",
                }
            ],
            "payment_methods": [
                {"method": "Transfer", "count": 2}
            ],
            "observed_movements_in_sample": 2,
            "limitations": [
                "A decisao deve ser humana."
            ],
        },
        forbidden_identifiers=(
            "882",
            "8865018891",
            "2487415444",
            "987654321",
        ),
    )


def successful_answer():
    return ChatResponse(
        answer=(
            "Os sinais financeiros justificam "
            "diligencia adicional [F1]."
        ),
        sources=[
            Source(
                title="[F1] Art. 10 - Fonte juridica",
                excerpt=(
                    "Fonte revisada. "
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
        "prepared": prepared_alert(),
        "questions": [],
        "saves": 0,
        "original_answer": alert_ai_service.answer_alert_question,
    }

    monkeypatch.setattr(
        ai,
        "get_engine",
        lambda: engine,
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

    def answer(prepared, question):
        assert not engine.active
        assert prepared is state["prepared"]

        state["questions"].append(question)
        engine.events.append("answer")

        return successful_answer()

    def forbidden_save(*args, **kwargs):
        state["saves"] += 1
        raise AssertionError(
            "O chat contextual nao deve gravar parecer."
        )

    monkeypatch.setattr(
        ai,
        "prepare_alert_ai",
        prepare,
    )

    monkeypatch.setattr(
        alert_ai_service,
        "answer_alert_question",
        answer,
    )

    monkeypatch.setattr(
        ai,
        "save_generated_assessment",
        forbidden_save,
    )

    try:
        with TestClient(app) as client:
            yield client, engine, state
    finally:
        app.dependency_overrides.clear()


def test_http_200_with_answer_and_sources(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(),
    )

    assert response.status_code == 200, response.text

    body = response.json()

    assert "[F1]" in body["answer"]
    assert len(body["sources"]) == 1

    assert state["questions"] == [
        "Quais diligencias sao recomendadas?"
    ]

    assert state["saves"] == 0
    assert engine.transactions == 1


def test_database_closes_before_generation(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(),
    )

    assert response.status_code == 200

    assert engine.events == [
        "begin",
        "dataset:saml-d",
        "prepare",
        "close",
        "answer",
    ]

    assert not engine.active


def test_dataset_header_is_respected(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(),
        headers={"X-Dataset": "saml-d"},
    )

    assert response.status_code == 200
    assert "dataset:saml-d" in engine.events


def test_mismatched_alert_id_returns_422(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(alert_id="999"),
    )

    assert response.status_code == 422
    assert response.json()["code"] == "ai.alert_context_mismatch"

    assert engine.transactions == 0
    assert state["questions"] == []


def test_missing_body_alert_id_is_allowed(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(alert_id=None),
    )

    assert response.status_code == 200
    assert engine.transactions == 1


def test_invalid_message_returns_422(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(message="   "),
    )

    assert response.status_code == 422
    assert engine.transactions == 0


def test_invalid_url_alert_id_returns_422(setup_http):
    client, engine, state = setup_http

    response = client.post(
        "/alerts/abc/chat",
        json=request_payload(),
    )

    assert response.status_code == 422
    assert engine.transactions == 0


def test_missing_alert_returns_404(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    def missing(conn, alert_id):
        raise AppError(
            404,
            "alert.not_found",
            "Alerta nao encontrado.",
        )

    monkeypatch.setattr(
        ai,
        "prepare_alert_ai",
        missing,
    )

    response = client.post(
        "/alerts/999/chat",
        json=request_payload(alert_id="999"),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "alert.not_found"
    assert state["questions"] == []
    assert engine.transactions == 1


def test_missing_legal_sources_returns_503(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    def no_sources(prepared, question):
        assert not engine.active
        raise LegalEvidenceUnavailableError(
            "Nenhuma fonte juridica revisada."
        )

    monkeypatch.setattr(
        alert_ai_service,
        "answer_alert_question",
        no_sources,
    )

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(),
    )

    assert response.status_code == 503
    assert response.json()["code"] == "ai.no_legal_sources"
    assert not engine.active


def test_invalid_generation_returns_502(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    def invalid(prepared, question):
        assert not engine.active
        raise ValueError("Resposta invalida.")

    monkeypatch.setattr(
        alert_ai_service,
        "answer_alert_question",
        invalid,
    )

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(),
    )

    assert response.status_code == 502
    assert response.json()["code"] == "ai.invalid_assessment"
    assert state["saves"] == 0


def test_question_reaches_rag_without_identifiers(
    setup_http,
    monkeypatch,
):
    client, engine, state = setup_http

    prompts = []

    def fake_legal_chat(prompt):
        assert not engine.active
        prompts.append(prompt)
        return successful_answer()

    # Restaurar a funcao real que foi guardada antes
    # do monkeypatch realizado no fixture.
    monkeypatch.setattr(
        alert_ai_service,
        "answer_alert_question",
        state["original_answer"],
    )

    monkeypatch.setattr(
        alert_ai_service,
        "answer_legal_chat",
        fake_legal_chat,
    )

    response = client.post(
        "/alerts/882/chat",
        json=request_payload(
            message=(
                "Explique a conta 8865018891 "
                "e a transacao 987654321."
            )
        ),
    )

    assert response.status_code == 200, response.text
    assert len(prompts) == 1

    prompt = prompts[0]

    assert "91.5" in prompt
    assert "R-014" in prompt
    assert "[IDENTIFICADOR_OCULTO]" in prompt

    for identifier in state["prepared"].forbidden_identifiers:
        assert identifier not in prompt

    assert state["saves"] == 0
    assert engine.transactions == 1