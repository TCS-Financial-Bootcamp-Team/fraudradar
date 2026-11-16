"""Regression tests for legal sanctions vocabulary."""

import pytest

from fraudradar.ai.legal_hybrid import (
    CONCEPTS,
    _concepts,
    _explicit_article,
)


@pytest.mark.parametrize(
    "term",
    [
        "penalidades",
        "penalidades administrativas",
        "sancoes",
        "san\u00e7\u00f5es",
        "multa",
        "multas",
        "advertencia",
        "advert\u00eancia",
        "inabilitacao",
        "inabilita\u00e7\u00e3o",
    ],
)
def test_sanctions_vocabulary(term: str) -> None:
    assert "sanctions" in _concepts(term)


def test_sanctions_concept_is_configured() -> None:
    assert CONCEPTS["sanctions"] == (
        "penalid",
        "sanc",
        "multa",
        "advert",
        "inabilit",
    )


def test_existing_customer_concepts_remain() -> None:
    concepts = _concepts("identificacao e cadastro de clientes")

    assert {
        "identification",
        "registration",
        "customers",
    }.issubset(concepts)


def test_existing_communication_concepts_remain() -> None:
    concepts = _concepts("comunicacao de operacoes suspeitas")

    assert {
        "communications",
        "operations",
        "suspicion",
    }.issubset(concepts)


def test_explicit_article_matching_remains() -> None:
    assert _explicit_article("O que determina o Art. 10?") == "Art. 10"
