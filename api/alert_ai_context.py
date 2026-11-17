"""Prepare privacy-safe, factual alert context for PLD assistance.

Account identifiers, transaction identifiers and counterparties
must not be sent to external language models.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from typing import Any

from api.schemas.alerts import (
    Alert,
    Contribution,
    Movement,
    Rule,
)


_EMAIL = re.compile(
    r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"
)

_URL = re.compile(
    r"(?i)\b(?:https?://|www\.)[^\s]+"
)

_LONG_NUMBER = re.compile(r"(?<!\d)\d{5,}(?!\d)")


def _private_values(
    alert: Alert,
    movements: list[Movement],
) -> tuple[str, ...]:
    """Collect identifiers to redact from free-text fields."""

    values = {
        alert.id,
        alert.account,
    }

    for movement in movements:
        values.update(
            (
                movement.id,
                movement.sender,
                movement.receiver,
            )
        )

    return tuple(
        sorted(
            (
                value
                for value in values
                if isinstance(value, str)
                and len(value) >= 3
            ),
            key=len,
            reverse=True,
        )
    )


def _safe_text(
    value: str,
    private_values: tuple[str, ...],
) -> str:
    """Redact identifiers and potentially sensitive free text."""

    if not isinstance(value, str):
        raise ValueError("Campo textual invalido.")

    text = value[:500]

    text = _EMAIL.sub("[EMAIL_REDACTED]", text)
    text = _URL.sub("[URL_REDACTED]", text)

    for identifier in private_values:
        text = text.replace(
            identifier,
            "[IDENTIFIER_REDACTED]",
        )

    text = _LONG_NUMBER.sub(
        "[NUMBER_REDACTED]",
        text,
    )

    # Avoid propagating control characters into prompts.
    text = re.sub(
        r"[\x00-\x1f\x7f]",
        " ",
        text,
    )

    return text.strip()


def build_alert_context(
    alert: Alert,
    contributions: list[Contribution],
    rules: list[Rule],
    movements: list[Movement],
) -> dict[str, Any]:
    """Build an alert summary without account or transaction identifiers."""

    private_values = _private_values(
        alert,
        movements,
    )

    payment_counts = Counter(
        _safe_text(
            movement.payment_type,
            private_values,
        )
        for movement in movements
    )

    payment_methods = [
        {
            "method": method,
            "count": count,
        }
        for method, count in sorted(payment_counts.items())
        if method
    ]

    contribution_summary = [
        {
            "feature": _safe_text(
                item.name,
                private_values,
            ),
            "positive_contribution_pct": item.value,
        }
        for item in contributions[:6]
    ]

    rule_summary = [
        {
            "code": _safe_text(
                item.code,
                private_values,
            ),
            "description": _safe_text(
                item.description,
                private_values,
            ),
        }
        for item in rules[:10]
    ]

    context = {
        "analysis_type": "alert_review",
        "period_start": alert.week.isoformat(),
        "country": _safe_text(
            alert.country,
            private_values,
        ),
        "typology": _safe_text(
            alert.typology,
            private_values,
        ),
        "risk_score_0_to_100": alert.score,
        "financial_volume_gbp": round(
            alert.amount,
            2,
        ),
        "transaction_count": alert.transaction_count,
        "queue_position": alert.queue_position,
        "alert_origin": alert.origin,
        "model_contributions": contribution_summary,
        "triggered_rules": rule_summary,
        "payment_methods": payment_methods,
        "observed_movements_in_sample": len(movements),
        "limitations": [
            "A pontuacao de risco nao confirma atividade criminosa.",
            "As contribuicoes representam sinais do modelo.",
            "As movimentacoes podem ser uma amostra limitada.",
            "O parecer exige revisao e decisao humana.",
            "Fontes juridicas devem ser citadas separadamente.",
        ],
    }

    if contains_identifiers(
        context,
        forbidden_values=list(private_values),
    ):
        raise ValueError(
            "Identificador encontrado no contexto da IA."
        )

    return context


def contains_identifiers(
    context: dict[str, Any],
    *,
    forbidden_values: list[str],
) -> bool:
    """Detect explicitly forbidden identifier strings."""

    serialized = json.dumps(
        context,
        ensure_ascii=False,
        sort_keys=True,
    )

    return any(
        value in serialized
        for value in forbidden_values
        if value
    )