"""Offline tests for the contextual alert AI service.

No external Gemini requests or production database access.
"""

from datetime import date

import pytest

from api import alert_ai_service as service
from api.schemas.alerts import (
    Alert,
    Assessment,
    Contribution,
    Movement,
    Rule,
    Source,
)
from api.schemas.chat import ChatResponse


@pytest.fixture
def sample():
    alert = Alert(
        id="882",
        account="8865018891",
        week=date(2023, 6, 19),
        country="UK",
        typology="Fan-out",
        score=91.5,
        amount=35102.0,
        transaction_count=2,
        status="pending",
        queue_position=2,
        origin="model",
    )

    contributions = [
        Contribution(
            name="Dias desde o ultimo recebimento",
            value=70.0,
        ),
        Contribution(
            name="Numero de contrapartes",
            value=30.0,
        ),
    ]

    rules = [
        Rule(
            code="R-014",
            description="Multiplos destinatarios",
        )
    ]

    movements = [
        Movement(
            id="987654321",
            date="2023-06-20T10:00:00",
            sender="8865018891",
            receiver="2487415444",
            amount=1000.0,
            currency="GBP",
            payment_type="Transfer",
            payment_currency="Pound",
        ),
    ]

    return alert, contributions, rules, movements


@pytest.fixture
def prepared(sample):
    alert, contributions, rules, movements = sample

    from api.alert_ai_context import build_alert_context

    return service.PreparedAlertAI(
        context=build_alert_context(
            alert, contributions, rules, movements
        ),
        forbidden_identifiers=(
            "882",
            "8865018891",
            "2487415444",
            "987654321",
        ),
    )


def test_prepares_real_alert_using_repository_contract(
    monkeypatch, sample
):
    alert, contributions, rules, movements = sample

    row = {
        "id": 882,
        "account": 8865018891,
        "week": date(2023, 6, 19),
    }

    monkeypatch.setattr(
        service, "get_alert_row",
        lambda conn, alert_id: row,
    )

    monkeypatch.setattr(
        service, "alert_from_row",
        lambda received: alert,
    )

    monkeypatch.setattr(
        service.alert_queue,
        "alert_contributions",
        lambda conn, alert_id: contributions,
    )

    monkeypatch.setattr(
        service.alert_queue,
        "alert_rules",
        lambda conn, alert_id: rules,
    )

    monkeypatch.setattr(
        service.alert_queue,
        "account_movements",
        lambda conn, account, week: movements,
    )

    result = service.prepare_alert_ai(
        object(),
        882,
    )

    assert result.context["risk_score_0_to_100"] == 91.5
    assert result.context["transaction_count"] == 2
    assert result.context["triggered_rules"][0]["code"] == "R-014"
    assert "8865018891" in result.forbidden_identifiers


def test_prompt_contains_model_signals_and_legal_question(prepared):
    prompt = service._build_question(
        prepared,
        "Quais diligencias sao recomendadas?",
    )

    assert "91.5" in prompt
    assert "R-014" in prompt
    assert "Quais diligencias" in prompt
    assert "evidencias juridicas" in prompt


def test_prompt_excludes_known_financial_identifiers(prepared):
    prompt = service._build_question(
        prepared,
        "Explique o alerta da conta 8865018891.",
    )

    for identifier in prepared.forbidden_identifiers:
        assert identifier not in prompt

    assert "[IDENTIFICADOR_OCULTO]" in prompt


def test_question_removes_unknown_long_identifiers(prepared):
    prompt = service._build_question(
        prepared,
        "Confira a transacao 99999888887777.",
    )

    assert "99999888887777" not in prompt
    assert "[NUMERO_OCULTO]" in prompt


def test_question_removes_email_and_url(prepared):
    prompt = service._build_question(
        prepared,
        "Consulte teste@example.com e https://example.com/private",
    )

    assert "teste@example.com" not in prompt
    assert "https://example.com/private" not in prompt
    assert "[EMAIL_OCULTO]" in prompt
    assert "[URL_OCULTA]" in prompt


@pytest.mark.parametrize(
    "question",
    ["", "   ", "x" * 2001],
)
def test_rejects_invalid_question(prepared, question):
    with pytest.raises(ValueError):
        service._build_question(prepared, question)


def test_assessment_uses_legal_rag_and_frontend_contract(
    monkeypatch, prepared
):
    received = []

    def fake_legal_chat(question):
        received.append(question)

        return ChatResponse(
            answer=(
                "Os sinais justificam diligencia adicional [F1]. "
                "A decisao depende do analista."
            ),
            sources=[
                Source(
                    title="[F1] Art. 10 - Fonte juridica",
                    excerpt="Evidencia revisada de teste.",
                )
            ],
        )

    monkeypatch.setattr(
        service,
        "answer_legal_chat",
        fake_legal_chat,
    )

    result = service.generate_alert_assessment(prepared)

    assert isinstance(result, Assessment)
    assert "[F1]" in result.content
    assert len(result.sources) == 1
    assert len(received) == 1

    for identifier in prepared.forbidden_identifiers:
        assert identifier not in received[0]


def test_contextual_chat_uses_question_and_sources(
    monkeypatch, prepared
):
    received = []

    def fake_legal_chat(question):
        received.append(question)

        return ChatResponse(
            answer="A legislacao requer avaliacao humana [F1].",
            sources=[
                Source(
                    title="[F1] Lei 9.613/1998",
                    excerpt="Fonte juridica revisada.",
                )
            ],
        )

    monkeypatch.setattr(
        service,
        "answer_legal_chat",
        fake_legal_chat,
    )

    response = service.answer_alert_question(
        prepared,
        "Qual a relacao com a Lei 9.613/1998?",
    )

    assert isinstance(response, ChatResponse)
    assert "[F1]" in response.answer
    assert len(response.sources) == 1
    assert len(received) == 1
    assert "Lei 9.613/1998" in received[0]


def test_generation_error_is_not_silently_hidden(
    monkeypatch, prepared
):
    def unavailable(question):
        raise RuntimeError("Provedor indisponivel")

    monkeypatch.setattr(
        service,
        "answer_legal_chat",
        unavailable,
    )

    with pytest.raises(
        RuntimeError,
        match="Provedor indisponivel",
    ):
        service.generate_alert_assessment(prepared)


def test_inputs_are_not_mutated_by_prompt_generation(prepared):
    import copy

    original = copy.deepcopy(prepared.context)

    service._build_question(
        prepared,
        "Explique o risco.",
    )

    assert prepared.context == original