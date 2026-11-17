"""Check the real legal chat adapter against assessment persistence.

No external requests, no Gemini consumption and no database writes.
"""

from unittest.mock import MagicMock

import pytest

from api.dependencies import LOCAL_USER
from api.repositories.alert_assessments import (
    save_generated_assessment,
    validate_generated_assessment,
)
from api.schemas.alerts import Assessment
from fraudradar.ai.legal_chat_adapter import (
    LLM_UNAVAILABLE_ANSWER,
    legal_payload_to_chat_response,
)


def make_payload(status="generated"):
    payload = {
        "status": status,
        "requires_legal_review": False,
        "evidences": [
            {
                "citation_id": "F1",
                "review_status": "reviewed",
                "article": "Art. 10",
                "content": "Identificacao e manutencao de registros.",
                "official_url": "https://www.planalto.gov.br/teste",
            },
            {
                "citation_id": "F2",
                "review_status": "reviewed",
                "article": "Art. 11",
                "content": "Comunicacoes previstas na legislacao.",
                "official_url": "https://www.planalto.gov.br/teste",
            },
        ],
    }

    if status == "generated":
        payload.update(
            {
                "answer": (
                    "Existem sinais que exigem diligencia [F1]. "
                    "A avaliacao deve considerar os deveres legais [F2]. "
                    "O analista deve revisar as evidencias."
                ),
                "citations": ["F1", "F2"],
            }
        )
    else:
        payload.update(
            {
                "answer": None,
                "citations": [],
            }
        )

    return payload


def as_assessment(payload):
    response = legal_payload_to_chat_response(payload)

    return Assessment(
        content=response.answer,
        sources=response.sources,
    )


def test_real_adapter_produces_valid_assessment():
    assessment = as_assessment(make_payload())

    citations = validate_generated_assessment(assessment)

    assert citations == ("F1", "F2")
    assert len(assessment.sources) == 2

    for source in assessment.sources:
        assert "Fonte oficial: https://" in source.excerpt


def test_generated_answer_can_reach_persistence():
    assessment = as_assessment(make_payload())

    conn = MagicMock()
    conn.execute.return_value.scalar_one.return_value = 123

    result = save_generated_assessment(
        conn,
        alert_id=882,
        assessment=assessment,
        model="gemini-3.5-flash-lite",
        suggested_typology=None,
        user=LOCAL_USER,
    )

    assert result == 123
    assert conn.execute.call_count == 2


def test_real_adapter_fallback_is_rejected():
    assessment = as_assessment(make_payload("llm_unavailable"))

    assert len(assessment.sources) == 2
    assert assessment.content == LLM_UNAVAILABLE_ANSWER

    with pytest.raises(
        ValueError,
        match="Mensagem de indisponibilidade",
    ):
        validate_generated_assessment(assessment)


def test_fallback_never_reaches_database():
    assessment = as_assessment(make_payload("llm_unavailable"))

    conn = MagicMock()

    with pytest.raises(ValueError):
        save_generated_assessment(
            conn,
            alert_id=882,
            assessment=assessment,
            model="gemini-3.5-flash-lite",
            suggested_typology=None,
            user=LOCAL_USER,
        )

    conn.execute.assert_not_called()


def test_pending_legal_source_is_blocked():
    payload = make_payload()
    payload["evidences"][0]["review_status"] = "pending_review"

    with pytest.raises(
        ValueError,
        match="Documento juridico nao revisado",
    ):
        as_assessment(payload)


def test_unknown_legal_citation_is_blocked():
    payload = make_payload()
    payload["answer"] = "Referencia juridica desconhecida [F99]."
    payload["citations"] = ["F99"]

    # O adaptador juridico bloqueia a citacao desconhecida
    # antes da etapa de persistencia.
    with pytest.raises(
        ValueError,
        match="Resposta com citacao desconhecida",
    ):
        as_assessment(payload)


def test_source_without_https_is_blocked():
    payload = make_payload()
    payload["evidences"][0]["official_url"] = "http://example.org/inseguro"

    with pytest.raises(
        ValueError,
        match="URL da fonte juridica invalida",
    ):
        as_assessment(payload)
