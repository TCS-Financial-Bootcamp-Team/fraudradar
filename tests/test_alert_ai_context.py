"""Testes offline do contexto protegido usado pela IA de alertas."""

import copy
import json

import pytest

from fraudradar.ai.alert_assessment import (
    AlertContextBlockedError,
    PreparedAlertAI,
    build_alert_chat_request,
    build_alert_context,
    contains_identifiers,
)


def sample_data(alert_id: int = 882):
    alert = {
        "id": str(alert_id),
        "account": "8865018891",
        "week": "2023-06-19",
        "country": "UK",
        "typology": "Indefinida",
        "score": 91.5,
        "amount": 35102.0,
        "transaction_count": 2,
        "queue_position": 2,
        "origin": "model",
    }
    contributions = [
        {"name": "Primeira transação entre as duas contas", "value": 29.7},
        {"name": "Dias desde o último recebimento", "value": 15.7},
    ]
    rules = [{"code": "R-TEST", "description": "Regra demonstrativa"}]
    movements = [
        {
            "id": "987654321",
            "sender": "8865018891",
            "receiver": "2487415444",
            "payment_type": "Credit card",
        },
        {
            "id": "987654322",
            "sender": "2321774979",
            "receiver": "8865018891",
            "payment_type": "Credit card",
        },
    ]
    return alert, contributions, rules, movements


def build_sample(alert_id: int = 882) -> PreparedAlertAI:
    return build_alert_context(*sample_data(alert_id))


def test_context_preserves_facts_without_structured_identifiers():
    prepared = build_sample()
    context = prepared.context

    assert context["analysis_type"] == "alert_review"
    assert context["period_start"] == "2023-06-19"
    assert context["risk_score_0_to_100"] == 91.5
    assert context["financial_volume_gbp"] == 35102.0
    assert context["model_contributions"][0]["positive_contribution_pct"] == 29.7
    assert context["triggered_rules"] == [{"code": "R-TEST", "description": "Regra demonstrativa"}]
    assert context["payment_methods"] == [{"method": "Credit card", "count": 2}]
    assert context["observed_movements_in_sample"] == 2
    assert "typology" not in context
    assert set(prepared.forbidden_identifiers) == {
        "8865018891",
        "2487415444",
        "2321774979",
    }
    assert "882" not in prepared.forbidden_identifiers
    assert not contains_identifiers(
        context,
        forbidden_values=prepared.forbidden_identifiers,
    )
    assert all(field not in context for field in ("account", "alert_id", "sender", "receiver"))


def test_context_is_serializable_and_keeps_human_review_warning():
    context = build_sample().context
    assert json.dumps(context, ensure_ascii=False)
    limitations = " ".join(context["limitations"]).lower()
    assert "decisão humana" in limitations
    assert "não confirma" in limitations
    assert "fontes jurídicas" in limitations


def test_context_does_not_mutate_plain_inputs():
    values = sample_data()
    original = copy.deepcopy(values)
    build_alert_context(*values)
    assert values == original


def test_context_redacts_known_and_unknown_identifiers_in_free_text():
    alert, contributions, rules, movements = sample_data()
    contributions[0]["name"] = "Conta 8865018891 transferiu para 2487415444"
    rules[0]["description"] = (
        "Contato teste@example.com; https://example.com/private; protocolo 99999888887777"
    )

    context = build_alert_context(alert, contributions, rules, movements).context
    serialized = json.dumps(context)
    for secret in (
        "8865018891",
        "2487415444",
        "teste@example.com",
        "https://example.com/private",
        "99999888887777",
    ):
        assert secret not in serialized


def test_identifier_match_uses_whole_integer_tokens():
    forbidden = ["35102", "8865018891"]
    assert contains_identifiers("Conta 8865018891", forbidden_values=forbidden)
    assert not contains_identifiers("Conta 188650188919", forbidden_values=forbidden)
    assert not contains_identifiers("Valor 35102.0", forbidden_values=forbidden)
    assert not contains_identifiers("Valor 35102,50", forbidden_values=forbidden)


def test_alert_database_ids_from_1_to_5000_never_block_realistic_contexts():
    for alert_id in range(1, 5001):
        prepared = build_sample(alert_id)
        assert str(alert_id) not in prepared.forbidden_identifiers


def test_small_movement_ids_do_not_collide_with_context_date():
    alert, contributions, rules, movements = sample_data()
    movements.append({**movements[0], "id": "2"})
    movements[0]["id"] = "19"
    movements[1]["id"] = "2023"

    prepared = build_alert_context(alert, contributions, rules, movements)

    assert prepared.context["period_start"] == "2023-06-19"
    assert all(value not in prepared.forbidden_identifiers for value in ("2", "19", "2023"))


@pytest.mark.parametrize("leaked", ["8865018891", "2487415444"])
def test_context_guard_blocks_account_or_counterparty(leaked):
    prepared = build_sample()
    unsafe = PreparedAlertAI(
        context={**prepared.context, "country": leaked},
        forbidden_identifiers=prepared.forbidden_identifiers,
    )
    with pytest.raises(AlertContextBlockedError):
        build_alert_chat_request(unsafe, "Explique o risco.")
