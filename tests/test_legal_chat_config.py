"""Chat jurídico sem o Gemini configurado responde 503, e resposta sem citação responde 502.

Antes, a falta de LLM_MODEL ou da chave virava ValueError e a API devolvia 500. Sem banco: a
checagem acontece antes da busca.
"""

import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from api.dependencies import LOCAL_USER, get_current_user
from api.legal_chat_service import answer_legal_chat
from api.main import create_app
from fraudradar.ai.legal_generation import (
    ASSESSMENT_MAX_OUTPUT_TOKENS,
    ASSESSMENT_SYSTEM_INSTRUCTION,
    CHAT_MAX_OUTPUT_TOKENS,
    SYSTEM_INSTRUCTION,
    LegalAnswerRejectedError,
    LegalLlmNotConfiguredError,
    gemini_settings,
    generate_legal_answer,
    generate_legal_answer_from_settings,
    split_grouped_citations,
)
from fraudradar.config import get_settings

QUESTION = "Quais sao as penalidades administrativas?"
CHAT = {
    "message": QUESTION,
    "context": {"page": "/dashboard", "week": "2023-01-02"},
    "history": [],
}


def _env(monkeypatch, **values: str) -> None:
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()


@pytest.fixture
def gemini(monkeypatch):
    """O Gemini completo; cada teste tira uma peça. O conftest começa com LLM_PROVIDER=openai."""
    _env(monkeypatch, LLM_PROVIDER="gemini", LLM_MODEL="gemini-teste", GEMINI_API_KEY="chave")
    return monkeypatch


@pytest.fixture
def http_client():
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: LOCAL_USER
    # Sem levantar a exceção do servidor: o controle do 500 precisa da resposta.
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()


class FakeEngine:
    """Conta as conexões: a checagem do LLM precisa vir antes de qualquer uma."""

    def __init__(self) -> None:
        self.connections = 0

    @contextmanager
    def connect(self):
        self.connections += 1
        yield object()


def test_complete_settings(gemini):
    assert gemini_settings() == ("gemini-teste", "chave")


def test_google_api_key_is_accepted(gemini):
    _env(gemini, GEMINI_API_KEY="", GOOGLE_API_KEY="chave-google")
    assert gemini_settings() == ("gemini-teste", "chave-google")


@pytest.mark.parametrize(
    ("missing", "message"),
    [
        ({"LLM_PROVIDER": "openai"}, "provedor"),
        ({"LLM_MODEL": ""}, "LLM_MODEL"),
        ({"LLM_MODEL": "   "}, "LLM_MODEL"),
        ({"GEMINI_API_KEY": ""}, "Chave do Gemini"),
    ],
)
def test_each_missing_piece_is_not_configured(gemini, missing, message):
    _env(gemini, **missing)
    with pytest.raises(LegalLlmNotConfiguredError, match=message):
        gemini_settings()


def test_service_fails_before_touching_the_database(gemini):
    _env(gemini, LLM_MODEL="")
    engine = FakeEngine()

    def retriever(*args, **kwargs):
        raise AssertionError("a busca não pode rodar sem o LLM configurado")

    with pytest.raises(LegalLlmNotConfiguredError):
        answer_legal_chat(QUESTION, engine=engine, retriever=retriever)
    assert engine.connections == 0


def test_small_talk_service_does_not_call_injected_retriever_or_generator(monkeypatch):
    engine = FakeEngine()

    def forbidden(*args, **kwargs):
        raise AssertionError("Conversas curtas não devem consultar serviços externos.")

    monkeypatch.setattr("api.legal_chat_service.gemini_settings", forbidden)
    response = answer_legal_chat("OLÁ!!!", engine=engine, retriever=forbidden, generator=forbidden)
    assert response.sources == []
    assert engine.connections == 0


def test_configured_service_reaches_the_retrieval(gemini):
    """Controle: com o Gemini completo, a checagem deixa a busca rodar."""

    class ReachedError(Exception):
        pass

    def retriever(*args, **kwargs):
        raise ReachedError

    engine = FakeEngine()
    with pytest.raises(ReachedError):
        answer_legal_chat(QUESTION, engine=engine, retriever=retriever)
    assert engine.connections == 1


def test_optional_retrieval_query_does_not_replace_generation_question(gemini):
    received = []

    class ReachedError(Exception):
        pass

    def retriever(*args, **kwargs):
        received.append(kwargs["question"])
        raise ReachedError

    with pytest.raises(ReachedError):
        answer_legal_chat(
            QUESTION,
            retrieval_query="consulta jurídica curta",
            engine=FakeEngine(),
            retriever=retriever,
        )
    assert received == ["consulta jurídica curta"]


def test_http_without_llm_settings_is_503(http_client):
    """O caminho real, sem dublê: o conftest deixa LLM_PROVIDER=openai e as chaves vazias."""
    response = http_client.post("/chat", json=CHAT)
    assert response.status_code == 503
    assert response.json()["code"] == "ai.not_configured"
    assert response.json()["detail"] == (
        "A IA não está configurada na API (defina LLM_MODEL e a chave do Gemini)."
    )


@pytest.mark.parametrize(
    ("error", "status_code", "code"),
    [
        (LegalLlmNotConfiguredError("Defina LLM_MODEL no arquivo .env."), 503, "ai.not_configured"),
        (
            LegalAnswerRejectedError("Resposta sem citacoes verificaveis."),
            502,
            "ai.provider_failed",
        ),
    ],
)
def test_http_maps_the_chat_errors(http_client, error, status_code, code):
    with patch("api.routes.ai.answer_legal_chat", side_effect=error):
        response = http_client.post("/chat", json=CHAT)
    assert response.status_code == status_code
    assert response.json()["code"] == code


def test_http_other_value_errors_stay_500(http_client):
    """Controle: só as duas subclasses mudam de código; outro ValueError é defeito (500)."""
    with patch("api.routes.ai.answer_legal_chat", side_effect=ValueError("defeito")):
        response = http_client.post("/chat", json=CHAT)
    assert response.status_code == 500


CONTEXT = "Evidencias juridicas:\n" + json.dumps(
    [
        {
            "citation_id": "F1",
            "content": "Art. 12. Sancoes administrativas.",
            "review_status": "reviewed",
        }
    ]
)


def _client(text: str | None) -> SimpleNamespace:
    """Imita client.models.generate_content do google-genai."""
    return SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **kwargs: SimpleNamespace(text=text))
    )


@pytest.mark.parametrize(
    "text",
    [None, "", "   ", "Resposta sem citacao.", "Resposta com fonte inventada [F9]."],
)
def test_unusable_answer_is_rejected(text):
    with pytest.raises(LegalAnswerRejectedError):
        generate_legal_answer(
            question=QUESTION, context=CONTEXT, model="gemini-teste", client=_client(text)
        )


def test_cited_answer_passes():
    """Controle: a mesma montagem, com citação conferível, gera a resposta."""
    answer = generate_legal_answer(
        question=QUESTION, context=CONTEXT, model="gemini-teste", client=_client("Ha multa [F1].")
    )
    assert answer.citations == ("F1",)


def test_grouped_citations_are_split():
    """O Gemini às vezes agrupa "[F1, F2]"; sem separar, F2 sumiria das fontes."""
    assert split_grouped_citations("Deveres [F1, F2] e [F3; F4].") == (
        "Deveres [F1] [F2] e [F3] [F4]."
    )
    assert split_grouped_citations("Texto [F1] e [nota, solta].") == "Texto [F1] e [nota, solta]."


def test_grouped_citation_with_unknown_id_is_rejected():
    """Controle: um id inexistente dentro do grupo continua barrado."""
    with pytest.raises(LegalAnswerRejectedError):
        generate_legal_answer(
            question=QUESTION,
            context=CONTEXT,
            model="gemini-teste",
            client=_client("Ha multa [F1, F9]."),
        )


@pytest.mark.parametrize(
    ("instruction", "budget"),
    [
        (SYSTEM_INSTRUCTION, CHAT_MAX_OUTPUT_TOKENS),
        (ASSESSMENT_SYSTEM_INSTRUCTION, ASSESSMENT_MAX_OUTPUT_TOKENS),
    ],
)
def test_generation_settings_reach_client_with_shared_validation(gemini, instruction, budget):
    configs = []

    def generate(**kwargs):
        configs.append(kwargs["config"])
        return SimpleNamespace(text="Deveres legais [F1].")

    client = SimpleNamespace(models=SimpleNamespace(generate_content=generate), close=lambda: None)
    with patch("fraudradar.ai.legal_generation.genai.Client", return_value=client):
        answer = generate_legal_answer_from_settings(
            question=QUESTION,
            context=CONTEXT,
            system_instruction=instruction,
            max_output_tokens=budget,
        )
    assert answer.citations == ("F1",)
    assert configs[0].system_instruction == instruction
    assert configs[0].max_output_tokens == budget
    with pytest.raises(LegalAnswerRejectedError):
        generate_legal_answer(
            question=QUESTION,
            context=CONTEXT,
            model="teste",
            client=_client("Sem citação."),
            system_instruction=instruction,
            max_output_tokens=budget,
        )
