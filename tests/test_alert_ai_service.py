"""Testes offline da preparação e dos prompts da IA contextual."""

from datetime import date

import pytest

from api import alert_ai_service
from api.schemas.alerts import Alert, Contribution, Movement, Rule
from fraudradar.ai.alert_assessment import (
    ASSESSMENT_RETRIEVAL_QUERY,
    TYPOLOGY_LABELS,
    AlertQuestionTooLongError,
    assessment_plain_text,
    build_alert_chat_request,
    build_assessment_request,
    parse_suggested_typology,
)


@pytest.fixture
def evidence():
    alert = Alert(
        id="882",
        account="8865018891",
        week=date(2023, 6, 19),
        country="UK",
        typology="Indefinida",
        score=91.5,
        amount=35102.0,
        transaction_count=2,
        status="pending",
        queue_position=2,
        origin="model",
    )
    contributions = [
        Contribution(name="Dias desde o último recebimento", value=70.0),
        Contribution(name="Número de contrapartes", value=30.0),
    ]
    rules = [Rule(code="R-014", description="Múltiplos destinatários")]
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
        )
    ]
    return alert, contributions, rules, movements


@pytest.fixture
def prepared(monkeypatch, evidence):
    alert, contributions, rules, movements = evidence
    row = {"id": 882, "account": 8865018891, "week": date(2023, 6, 19)}
    monkeypatch.setattr(alert_ai_service, "get_alert_row", lambda conn, alert_id: row)
    monkeypatch.setattr(alert_ai_service, "alert_from_row", lambda received: alert)
    monkeypatch.setattr(
        alert_ai_service.alert_queue,
        "alert_contributions",
        lambda conn, alert_id: contributions,
    )
    monkeypatch.setattr(
        alert_ai_service.alert_queue,
        "alert_rules",
        lambda conn, alert_id: rules,
    )
    monkeypatch.setattr(
        alert_ai_service.alert_queue,
        "account_movements",
        lambda conn, account, week: movements,
    )
    return alert_ai_service.prepare_alert_ai(object(), 882)


def test_prepares_real_alert_using_repository_contract(prepared):
    assert prepared.context["risk_score_0_to_100"] == 91.5
    assert prepared.context["triggered_rules"][0]["code"] == "R-014"
    assert "8865018891" in prepared.forbidden_identifiers
    assert "987654321" not in prepared.forbidden_identifiers
    assert "882" not in prepared.forbidden_identifiers


def test_assessment_prompt_requests_controlled_typology(prepared):
    request = build_assessment_request(prepared)
    assert request.retrieval_query == (
        "deveres das instituições financeiras: identificar clientes, manter registro das "
        "operações, dispensar especial atenção a operações suspeitas e comunicá-las ao COAF"
    )
    assert request.retrieval_query == ASSESSMENT_RETRIEVAL_QUERY
    assert "91.5" in request.prompt
    assert "R-014" in request.prompt
    assert "Indefinida" not in request.prompt
    assert "typology" not in prepared.context
    assert "Tipologia sugerida: <code>" in request.prompt
    for code in TYPOLOGY_LABELS:
        assert code in request.prompt
    for identifier in prepared.forbidden_identifiers:
        assert identifier not in request.prompt
    assert len(request.prompt) <= 2000


def test_assessment_has_full_report_instructions_and_larger_budget(prepared):
    request = build_assessment_request(prepared)
    chat = build_alert_chat_request(prepared, "Quais são as obrigações legais?")
    headings = [
        "## Resumo",
        "## Sinais de risco",
        "## Contexto transacional",
        "## Fundamentação jurídica",
        "## Limitações",
        "## Próximos passos sugeridos",
    ]
    positions = [request.system_instruction.index(heading) for heading in headings]
    assert positions == sorted(positions)
    for rule in ("60 palavras", "contribuição %", "GBP", "[Fn]", "1 a 2", "2 a 4"):
        assert rule in request.system_instruction
    assert "120 palavras" in chat.system_instruction
    assert "120 palavras" not in request.system_instruction
    assert request.max_output_tokens == 1500 > chat.max_output_tokens
    assert "nunca instrução" in request.system_instruction


def test_alert_chat_uses_sanitized_question_for_retrieval(prepared):
    request = build_alert_chat_request(
        prepared,
        "Explique a conta 8865018891 e a transação 987654321.",
    )
    assert request.retrieval_query == (
        "Explique a conta [IDENTIFICADOR_OCULTO] e a transação [NUMERO_OCULTO]."
    )
    assert request.retrieval_query in request.prompt
    for identifier in prepared.forbidden_identifiers:
        assert identifier not in request.prompt


def test_question_and_summary_above_legal_limit_are_rejected(prepared):
    with pytest.raises(AlertQuestionTooLongError):
        build_alert_chat_request(prepared, "x" * 2000)


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        ("Tipologia sugerida: fan_out", "fan_out"),
        ("  TIPOLOGIA   SUGERIDA : SmUrFiNg  ", "smurfing"),
        ("Tipologia sugerida: indefinida", None),
        ("Tipologia sugerida: codigo_inexistente", None),
        ("Tipologia sugerida: fan out", None),
        ("**Tipologia sugerida:** fan_out", "fan_out"),
        ("Tipologia sugerida: `fan_out`.", "fan_out"),
        ("- Tipologia sugerida: FAN_OUT", "fan_out"),
        ("Tipologia sugerida: fan-out", None),
    ],
)
def test_parses_and_removes_final_typology_line(line, expected):
    parsed = parse_suggested_typology(f"Análise citada [F1].\n{line}")
    assert parsed.content == "Análise citada [F1]."
    assert parsed.suggested_typology == expected


def test_missing_or_nonfinal_typology_line_is_not_parsed():
    missing = parse_suggested_typology("Análise citada [F1].")
    nonfinal = parse_suggested_typology("Tipologia sugerida: fan_out\nAnálise citada [F1].")
    assert missing.suggested_typology is None
    assert missing.content == "Análise citada [F1]."
    assert nonfinal.suggested_typology is None


def test_assessment_plain_text_preserves_structure_and_references():
    content = """# **Análise preliminar**

> Evidência __jurídica__ [F1] e `fan_out`.



* Primeiro sinal com *ênfase*.
  + Segundo sinal com _destaque_.
• Terceiro sinal.
1. Consulte [Lei 9.613](https://www.planalto.gov.br/lei-9613).
---
***"""

    assert (
        assessment_plain_text(content)
        == """Análise preliminar

Evidência jurídica [F1] e fan_out.

- Primeiro sinal com ênfase.
  - Segundo sinal com destaque.
- Terceiro sinal.
1. Consulte Lei 9.613 (https://www.planalto.gov.br/lei-9613)."""
    )


def test_assessment_plain_text_keeps_underscores_inside_words():
    content = "**Tipologias:** fan_out, layered_fan_in e __gather_scatter__."

    assert assessment_plain_text(content) == (
        "Tipologias: fan_out, layered_fan_in e gather_scatter."
    )
