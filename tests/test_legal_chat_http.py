"""Offline HTTP tests for the general legal chat endpoint."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.dependencies import LOCAL_USER, get_current_user
from api.legal_chat_service import LegalEvidenceUnavailableError
from api.main import create_app
from api.schemas.alerts import Source
from api.schemas.chat import ChatResponse


@pytest.fixture
def http_client():
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: LOCAL_USER

    try:
        with TestClient(app) as client:
            yield app, client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def chat_request():
    return {
        "message": "Quais sao as penalidades administrativas?",
        "context": {
            "page": "/dashboard",
            "week": "2023-01-02",
        },
        "history": [],
    }


def forbidden_service(*args, **kwargs):
    raise AssertionError("Service must not be called")


def test_chat_http_200_with_sources(http_client, chat_request):
    _, client = http_client
    calls = []

    def simulated_service(question):
        calls.append(question)
        return ChatResponse(
            answer="Synthetic answer supported by [F1].",
            sources=[
                Source(
                    title="[F1] Art. 12 - Legal source",
                    excerpt=("Synthetic evidence.\\n\\nOfficial source: https://example.org/test"),
                )
            ],
        )

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=simulated_service,
    ):
        response = client.post("/chat", json=chat_request)

    assert response.status_code == 200
    payload = response.json()
    assert "[F1]" in payload["answer"]
    assert len(payload["sources"]) == 1
    assert "[F1]" in payload["sources"][0]["title"]
    assert calls == [chat_request["message"]]


def test_chat_http_503_without_reviewed_sources(http_client, chat_request):
    _, client = http_client

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=LegalEvidenceUnavailableError("No approved evidence"),
    ):
        response = client.post("/chat", json=chat_request)

    assert response.status_code == 503
    assert "fonte juridica" in response.json()["detail"].lower()


def test_chat_http_422_for_empty_message(http_client, chat_request):
    _, client = http_client

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=forbidden_service,
    ):
        response = client.post(
            "/chat",
            json={**chat_request, "message": "   "},
        )

    assert response.status_code == 422


def test_chat_http_422_for_numeric_identifier(http_client, chat_request):
    _, client = http_client

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=forbidden_service,
    ):
        response = client.post(
            "/chat",
            json={
                **chat_request,
                "message": "Analise a conta 12345678901",
            },
        )

    assert response.status_code == 422


def test_chat_http_400_for_alert_context(http_client, chat_request):
    _, client = http_client

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=forbidden_service,
    ):
        response = client.post(
            "/chat",
            json={
                **chat_request,
                "context": {
                    **chat_request["context"],
                    "alert_id": "123",
                },
            },
        )

    assert response.status_code == 400


def test_chat_http_401_for_rejected_auth(http_client, chat_request):
    app, client = http_client

    def reject_auth():
        raise HTTPException(
            status_code=401,
            detail="Synthetic authentication rejection",
        )

    app.dependency_overrides[get_current_user] = reject_auth

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=forbidden_service,
    ):
        response = client.post("/chat", json=chat_request)

    assert response.status_code == 401
