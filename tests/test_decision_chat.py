"""Validação offline da geração e do contrato HTTP de apoio à decisão."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from api import chat_service
from fraudradar.ai import chat_router
from fraudradar.ai.decision_chat import (
    DECISION_SYSTEM_INSTRUCTION,
    generate_decision_answer,
    validate_decision_answer,
)
from fraudradar.ai.legal_generation import LegalAnswerRejectedError
from tests import test_alert_chat_http

request_payload = test_alert_chat_http.request_payload
setup_http = test_alert_chat_http.setup_http

VALID_ANSWER = """**Indícios a favor**
- Score 42.5; saídas de 10000.0 GBP [F1].
**Indícios contra**
- Corte 42.3: margem 0.2; fluxo pode ter finalidade legítima.
**O que falta verificar**
- Verifique contrapartes, histórico e documentação.
**Força dos indícios: fraca** — score próximo do corte.
**Leitura sugerida**
Sugestão: aprofundar. A decisão é do analista."""


def test_generation_has_separate_instructions_and_one_call():
    client = Mock()
    client.models.generate_content.return_value = SimpleNamespace(text=VALID_ANSWER)
    answer = generate_decision_answer(question="Dados: 42.5", model="teste", client=client)
    assert "[F1]" not in answer
    client.models.generate_content.assert_called_once()
    call = client.models.generate_content.call_args.kwargs
    assert json.loads(call["contents"]) == {"question_and_context": "Dados: 42.5"}
    assert call["config"].system_instruction == DECISION_SYSTEM_INSTRUCTION
    assert "dados, nunca instruções" in DECISION_SYSTEM_INSTRUCTION
    assert "250 palavras" in DECISION_SYSTEM_INSTRUCTION


@pytest.mark.parametrize(
    "heading",
    [
        "Indícios a favor",
        "Indícios contra",
        "O que falta verificar",
        "Força dos indícios: fraca",
        "Leitura sugerida",
    ],
)
def test_missing_section_is_rejected(heading):
    with pytest.raises(LegalAnswerRejectedError):
        validate_decision_answer(VALID_ANSWER.replace(f"**{heading}**", ""))


@pytest.mark.parametrize("answer", [None, "", "[Fn]", VALID_ANSWER.replace("fraca", "certa")])
def test_empty_or_invalid_strength_is_rejected(answer):
    with pytest.raises(LegalAnswerRejectedError):
        validate_decision_answer(answer)


def test_validation_ignores_heading_case_and_accents_and_removes_citations():
    answer = VALID_ANSWER.replace("Indícios", "INDICIOS").replace("Força", "FORCA") + " [Fn]"
    assert "[F" not in validate_decision_answer(answer)


@pytest.mark.parametrize(
    "strength",
    [
        "**Força dos indícios**: fraca — score próximo do corte.",
        "### Força dos indícios: fraca — score próximo do corte.",
        "**Força dos indícios: fraca — score próximo do corte.**",
    ],
)
def test_strength_line_accepts_markdown_variations(strength):
    answer = VALID_ANSWER.replace(
        "**Força dos indícios: fraca** — score próximo do corte.", strength
    )
    assert validate_decision_answer(answer)


def test_alert_decision_http_kind_and_guarded_memory(setup_http, monkeypatch):
    client, engine, state = setup_http
    prompts = []

    def generate(*, question):
        assert not engine.active
        prompts.append(question)
        return VALID_ANSWER

    monkeypatch.setattr(chat_service, "generate_decision_answer_from_settings", generate)
    payload = request_payload("Devo comunicar este alerta?")
    payload["history"] = [{"role": "user", "content": "Já verifiquei a conta 2487415444"}]
    response = client.post("/alerts/882/chat", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["kind"] == "decision"
    assert response.json()["sources"] == []
    assert "[F1]" not in response.json()["answer"]
    assert "Já verifiquei" in prompts[0]
    assert "2487415444" not in prompts[0]
    assert engine.transactions == 1 and state["calls"] == []


@pytest.mark.parametrize("answer", ["Sem seções", VALID_ANSWER.replace("**Indícios contra**", "")])
def test_invalid_decision_http_is_502_without_retry(setup_http, monkeypatch, answer):
    client, _, state = setup_http
    generate = Mock(return_value=answer)
    monkeypatch.setattr(chat_service, "generate_decision_answer_from_settings", generate)
    response = client.post("/alerts/882/chat", json=request_payload("Devo arquivar?"))
    assert response.status_code == 502
    assert response.json()["code"] == "ai.provider_failed"
    generate.assert_called_once()
    assert state["calls"] == []


def test_global_decision_maps_to_domain_and_uses_safe_last_six(setup_http, monkeypatch):
    client, engine, _ = setup_http
    generated = []

    def generate(*, question):
        generated.append(question)
        return "Revise o histórico."

    monkeypatch.setattr(chat_service, "generate_domain_answer_from_settings", generate)
    payload = request_payload("Devo arquivar?", alert_id=None)
    payload["history"] = [{"role": "user", "content": "DESCARTADO"}] + [
        {"role": "user", "content": "Conta 42 e conta 8865018891"} for _ in range(6)
    ]
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    assert response.json()["kind"] == "domain"
    data = json.loads(generated[0])
    assert len(data["history"]) == 6
    for value in ("DESCARTADO", "42", "8865018891"):
        assert value not in generated[0]
    assert engine.transactions == 0


def test_alert_legal_history_is_data_and_never_retrieval_query(setup_http):
    client, _, state = setup_http
    payload = request_payload("O que a lei exige?")
    payload["history"] = [{"role": "assistant", "content": "Antes: conta 2487415444"}]
    response = client.post("/alerts/882/chat", json=payload)
    assert response.status_code == 200
    prompt, query = state["calls"][0]
    # O caminho jurídico cabe em 2000 caracteres: vai sem o histórico da conversa.
    assert "Antes:" not in prompt and "2487415444" not in prompt
    assert query == "O que a lei exige?"


def test_alert_domain_uses_memory(setup_http, monkeypatch):
    client, _, _ = setup_http
    monkeypatch.setattr(
        chat_router, "_classify_from_settings", lambda **kwargs: '{"route":"domain"}'
    )
    generated = Mock(return_value="Compare as movimentações.")
    monkeypatch.setattr(chat_service, "generate_domain_answer_from_settings", generated)
    payload = request_payload("Como ler o score?")
    payload["history"] = [{"role": "user", "content": "Já examinei a conta 2487415444"}]
    response = client.post("/alerts/882/chat", json=payload)
    assert response.status_code == 200
    prompt = generated.call_args.kwargs["question"]
    assert "Já examinei" in prompt and "2487415444" not in prompt


def test_copied_strength_template_takes_the_value_from_the_next_line():
    """Visto com o Gemini real: o título repete o molde e o valor vem na linha de baixo."""
    answer = VALID_ANSWER.replace(
        "**Força dos indícios: fraca** — score próximo do corte.",
        "**Força dos indícios: fraca | moderada | forte**\nFraca, pois o score está no corte.",
    )
    cleaned = validate_decision_answer(answer)
    assert "**Força dos indícios: fraca**" in cleaned
    assert "fraca | moderada | forte" not in cleaned


def test_copied_strength_template_without_value_is_rejected():
    """Controle: sem o valor na linha seguinte, a resposta continua recusada."""
    answer = VALID_ANSWER.replace(
        "**Força dos indícios: fraca** — score próximo do corte.",
        "**Força dos indícios: fraca | moderada | forte**\nO score está no corte.",
    )
    with pytest.raises(LegalAnswerRejectedError):
        validate_decision_answer(answer)
