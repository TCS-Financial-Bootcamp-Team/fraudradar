"""Offline tests for privacy-safe AI alert context."""

from datetime import date
import json

from api.alert_ai_context import (
    build_alert_context,
    contains_identifiers,
)
from api.schemas.alerts import (
    Alert,
    Contribution,
    Movement,
    Rule,
)


def sample_data():
    alert = Alert(
        id="882",
        account="8865018891",
        week=date(2023, 6, 19),
        country="UK",
        typology="Indefinida",
        score=100.0,
        amount=35102.0,
        transaction_count=2,
        status="pending",
        queue_position=2,
        origin="model",
    )

    contributions = [
        Contribution(
            name="Primeira transacao entre as duas contas",
            value=29.7,
        ),
        Contribution(
            name="Dias desde o ultimo recebimento",
            value=15.7,
        ),
    ]

    rules = [
        Rule(
            code="R-TEST",
            description="Regra demonstrativa",
        )
    ]

    movements = [
        Movement(
            id="987654321",
            date="2023-06-21T10:00:00",
            sender="8865018891",
            receiver="2487415444",
            amount=9723.84,
            currency="GBP",
            payment_type="Credit card",
            payment_currency="Pound",
        ),
        Movement(
            id="987654322",
            date="2023-06-22T11:00:00",
            sender="2321774979",
            receiver="8865018891",
            amount=25378.08,
            currency="GBP",
            payment_type="Credit card",
            payment_currency="Pound",
        ),
    ]

    return alert, contributions, rules, movements


def build_sample():
    return build_alert_context(*sample_data())


def test_context_preserves_model_information():
    context = build_sample()

    assert context["analysis_type"] == "alert_review"
    assert context["period_start"] == "2023-06-19"
    assert context["country"] == "UK"
    assert context["risk_score_0_to_100"] == 100.0
    assert context["financial_volume_gbp"] == 35102.0
    assert context["transaction_count"] == 2
    assert context["queue_position"] == 2
    assert context["alert_origin"] == "model"


def test_context_preserves_model_contributions():
    context = build_sample()

    contributions = context["model_contributions"]

    assert len(contributions) == 2
    assert contributions[0]["positive_contribution_pct"] == 29.7
    assert contributions[1]["positive_contribution_pct"] == 15.7


def test_context_preserves_rules():
    context = build_sample()

    assert context["triggered_rules"] == [
        {
            "code": "R-TEST",
            "description": "Regra demonstrativa",
        }
    ]


def test_context_aggregates_payment_methods():
    context = build_sample()

    assert context["payment_methods"] == [
        {"method": "Credit card", "count": 2}
    ]

    assert context["observed_movements_in_sample"] == 2


def test_context_omits_structured_identifiers():
    context = build_sample()

    identifiers = [
        "882",
        "8865018891",
        "2487415444",
        "2321774979",
        "987654321",
        "987654322",
    ]

    # The short alert ID can occur in unrelated numeric
    # values; test long identifiers separately.
    assert not contains_identifiers(
        context,
        forbidden_values=identifiers[1:],
    )

    assert "account" not in context
    assert "alert_id" not in context
    assert "sender" not in context
    assert "receiver" not in context
    assert "transaction_id" not in context


def test_context_is_json_serializable():
    context = build_sample()

    serialized = json.dumps(
        context,
        ensure_ascii=False,
        sort_keys=True,
    )

    assert serialized
    assert "risk_score_0_to_100" in serialized


def test_context_preserves_human_review_warning():
    context = build_sample()

    limitations = " ".join(context["limitations"]).lower()

    assert "decisao humana" in limitations
    assert "nao confirma" in limitations
    assert "fontes juridicas" in limitations


def test_context_does_not_mutate_inputs():
    alert, contributions, rules, movements = sample_data()

    original_alert = alert.model_dump()
    original_contributions = [
        item.model_dump() for item in contributions
    ]
    original_rules = [
        item.model_dump() for item in rules
    ]
    original_movements = [
        item.model_dump() for item in movements
    ]

    build_alert_context(
        alert,
        contributions,
        rules,
        movements,
    )

    assert alert.model_dump() == original_alert
    assert [
        item.model_dump() for item in contributions
    ] == original_contributions

    assert [
        item.model_dump() for item in rules
    ] == original_rules

    assert [
        item.model_dump() for item in movements
    ] == original_movements


def test_context_handles_empty_evidence():
    alert, _, _, _ = sample_data()

    context = build_alert_context(
        alert,
        [],
        [],
        [],
    )

    assert context["model_contributions"] == []
    assert context["triggered_rules"] == []
    assert context["payment_methods"] == []
    assert context["observed_movements_in_sample"] == 0


def test_identifier_detector_rejects_known_value():
    context = build_sample()

    assert contains_identifiers(
        context,
        forbidden_values=["2023-06-19"],
    )

    assert not contains_identifiers(
        context,
        forbidden_values=["999999999999999"],
    )

def test_redacts_identifiers_inside_free_text():
    alert, contributions, rules, movements = sample_data()

    contributions[0].name = (
        "Conta 8865018891 transferiu para 2487415444"
    )

    rules[0].description = (
        "Transacao 987654321 de 2321774979"
    )

    context = build_alert_context(
        alert,
        contributions,
        rules,
        movements,
    )

    assert not contains_identifiers(
        context,
        forbidden_values=[
            "8865018891",
            "2487415444",
            "987654321",
            "2321774979",
        ],
    )


def test_redacts_email_and_url_from_text():
    alert, contributions, rules, movements = sample_data()

    rules[0].description = (
        "Contato teste@example.com "
        "https://example.com/private"
    )

    context = build_alert_context(
        alert,
        contributions,
        rules,
        movements,
    )

    text = json.dumps(context)

    assert "teste@example.com" not in text
    assert "https://example.com/private" not in text
    assert "[EMAIL_REDACTED]" in text
    assert "[URL_REDACTED]" in text


def test_redacts_unknown_long_number():
    alert, contributions, rules, movements = sample_data()

    contributions[0].name = (
        "Identificador externo 99999888887777"
    )

    context = build_alert_context(
        alert,
        contributions,
        rules,
        movements,
    )

    assert not contains_identifiers(
        context,
        forbidden_values=["99999888887777"],
    )


def test_redacts_identifier_in_payment_method():
    alert, contributions, rules, movements = sample_data()

    movements[0].payment_type = (
        "Credit card 8865018891"
    )

    context = build_alert_context(
        alert,
        contributions,
        rules,
        movements,
    )

    assert not contains_identifiers(
        context,
        forbidden_values=["8865018891"],
    )