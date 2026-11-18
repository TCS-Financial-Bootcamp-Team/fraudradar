"""Testes offline das explicações conceituais e do serviço sem recuperação."""

import json
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError

from api.chat_service import answer_chat_message
from api.schemas.chat import ChatResponse
from fraudradar.ai.alert_assessment import TYPOLOGY_LABELS
from fraudradar.ai.domain_chat import (
    DOMAIN_SYSTEM_INSTRUCTION,
    OUT_OF_SCOPE_REPLY,
    generate_domain_answer,
    validate_domain_answer,
)
from fraudradar.ai.legal_generation import LegalAnswerRejectedError
from fraudradar.ai.typology_glossary import TYPOLOGY_GLOSSARY


def test_glossary_covers_all_alert_typologies_without_empty_descriptions():
    assert set(TYPOLOGY_LABELS) <= set(TYPOLOGY_GLOSSARY)
    assert all(description.strip() for description in TYPOLOGY_GLOSSARY.values())
    assert "várias contas destinatárias" in TYPOLOGY_GLOSSARY["fan_out"]
    assert "várias contas de origem" in TYPOLOGY_GLOSSARY["fan_in"]


def test_domain_generation_receives_glossary_as_data_and_uses_its_own_instruction():
    client = Mock()
    client.models.generate_content.return_value = SimpleNamespace(
        text="Fan-out dispersa recursos para vários destinatários [F1]."
    )
    answer = generate_domain_answer(question="Explique fan-out", model="teste", client=client)
    assert answer == "Fan-out dispersa recursos para vários destinatários."
    call = client.models.generate_content.call_args.kwargs
    data = json.loads(call["contents"])
    assert data["question_and_context"] == "Explique fan-out"
    assert all(code in data["typology_reference"] for code in TYPOLOGY_LABELS)
    assert "atividades legítimas" in data["typology_reference"]
    assert call["config"].system_instruction == DOMAIN_SYSTEM_INSTRUCTION
    assert "o que a lei" in DOMAIN_SYSTEM_INSTRUCTION
    assert "decisão fica com o analista" in DOMAIN_SYSTEM_INSTRUCTION


@pytest.mark.parametrize("answer", [None, "", "   ", "[F1] [F2]", "[Fn]"])
def test_domain_rejects_empty_answers_after_stripping_citations(answer):
    with pytest.raises(LegalAnswerRejectedError):
        validate_domain_answer(answer)


def test_domain_service_never_calls_legal_answerer_and_strips_grouped_markers():
    legal = Mock(side_effect=AssertionError("Não deve recuperar fontes."))
    generator = Mock(return_value="Compare com o histórico [F1, F2]; revise os sinais [Fn].")
    response = answer_chat_message(
        "Como investigar?", route="domain", legal_answerer=legal, domain_generator=generator
    )
    assert response.model_dump() == {
        "kind": "domain",
        "answer": "Compare com o histórico; revise os sinais.",
        "sources": [],
        "links": [],
        "model": None,
        "conversation_id": None,
    }
    generator.assert_called_once_with(question="Como investigar?")
    legal.assert_not_called()


@pytest.mark.parametrize("route", ["small_talk", "out_of_scope"])
def test_fixed_replies_never_generate_or_retrieve(route):
    legal, generator = Mock(), Mock()
    response = answer_chat_message(
        "oi" if route == "small_talk" else "Quando o Titanic afundou?",
        route=route,
        legal_answerer=legal,
        domain_generator=generator,
    )
    assert response.kind == route
    assert response.sources == []
    if route == "out_of_scope":
        assert response.answer == OUT_OF_SCOPE_REPLY
    legal.assert_not_called()
    generator.assert_not_called()


def test_chat_response_requires_a_valid_kind():
    with pytest.raises(ValidationError):
        ChatResponse(answer="Resposta", sources=[])
    with pytest.raises(ValidationError):
        ChatResponse(kind="escape", answer="Resposta", sources=[])
