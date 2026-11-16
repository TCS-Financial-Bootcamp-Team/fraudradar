"""Offline tests for provider errors and chat context isolation."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from api.dependencies import LOCAL_USER, get_current_user
from api.main import create_app
from api.schemas.chat import ChatResponse


@pytest.fixture
def http_client():
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: LOCAL_USER

    try:
        with TestClient(app) as client:
            yield client
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
        "history": [
            {
                "role": "user",
                "content": "Previous synthetic question.",
            },
            {
                "role": "assistant",
                "content": "Previous synthetic response.",
            },
        ],
    }


@pytest.mark.parametrize(
    ("error_class", "provider_code", "expected_http"),
    [
        (errors.ClientError, 429, 429),
        (errors.ServerError, 503, 503),
        (errors.ServerError, 500, 502),
        (errors.ClientError, 400, 502),
    ],
)
def test_provider_errors_have_safe_http_responses(
    http_client,
    chat_request,
    error_class,
    provider_code,
    expected_http,
):
    provider_error = error_class(
        provider_code,
        {"message": "Sensitive provider detail"},
    )

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=provider_error,
    ) as service:
        response = http_client.post(
            "/chat",
            json=chat_request,
        )

    assert response.status_code == expected_http

    detail = response.json()["detail"]

    assert isinstance(detail, str)
    assert detail.strip()
    assert "Sensitive provider detail" not in detail

    service.assert_called_once_with(chat_request["message"])

    if provider_code == 429:
        assert "Limite temporario" in detail
    elif provider_code == 503:
        assert "temporariamente indisponivel" in detail
    else:
        assert "Nao foi possivel" in detail


def test_only_current_question_reaches_legal_service(
    http_client,
    chat_request,
):
    def simulated_service(question):
        return ChatResponse(
            answer="Synthetic response [F1].",
            sources=[],
        )

    with patch(
        "api.routes.ai.answer_legal_chat",
        side_effect=simulated_service,
    ) as service:
        response = http_client.post(
            "/chat",
            json=chat_request,
        )

    assert response.status_code == 200
    assert response.json()["answer"] == "Synthetic response [F1]."

    service.assert_called_once_with(chat_request["message"])

    passed_question = service.call_args.args[0]

    assert chat_request["context"]["page"] not in passed_question
    assert chat_request["context"]["week"] not in passed_question

    for item in chat_request["history"]:
        assert item["content"] not in passed_question
