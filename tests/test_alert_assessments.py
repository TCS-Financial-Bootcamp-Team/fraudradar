"""Offline tests for citation-validated assessment persistence.

All database operations are simulated.
No Gemini calls or real database connections are made.
"""

import json
from unittest.mock import MagicMock

import pytest

from api.dependencies import LOCAL_USER
from api.repositories.alert_assessments import (
    save_generated_assessment,
    validate_generated_assessment,
)
from api.schemas.alerts import Assessment, Source


def valid_assessment():
    return Assessment(
        content=(
            "Os sinais identificados justificam "
            "diligencia adicional [F1]. "
            "A conclusao depende de revisao humana [F2]."
        ),
        sources=[
            Source(
                title="[F1] Art. 10 - Fonte juridica",
                excerpt=(
                    "Obrigacoes de identificacao e registro. "
                    "Fonte oficial: https://www.planalto.gov.br/"
                ),
            ),
            Source(
                title="[F2] Art. 11 - Fonte juridica",
                excerpt=(
                    "Comunicacoes e providencias pertinentes. "
                    "Fonte oficial: https://www.planalto.gov.br/"
                ),
            ),
        ],
    )


def fake_connection(assessment_id=42):
    conn = MagicMock()
    conn.execute.return_value.scalar_one.return_value = assessment_id
    return conn


def test_valid_assessment_has_verified_citations():
    result = validate_generated_assessment(valid_assessment())

    assert result == ("F1", "F2")


def test_duplicate_citations_are_deduplicated():
    assessment = valid_assessment()

    assessment.content += " Outra referencia [F1]."

    result = validate_generated_assessment(assessment)

    assert result == ("F1", "F2")


def test_assessment_without_citations_is_rejected():
    assessment = valid_assessment()

    assessment.content = "Texto sem nenhuma referencia juridica."

    with pytest.raises(
        ValueError,
        match="sem citacoes",
    ):
        validate_generated_assessment(assessment)


def test_unknown_citation_is_rejected():
    assessment = valid_assessment()

    assessment.content = "Referencia inexistente [F99]."

    with pytest.raises(
        ValueError,
        match="fontes inexistentes",
    ):
        validate_generated_assessment(assessment)


def test_empty_sources_are_rejected():
    assessment = valid_assessment()
    assessment.sources = []

    with pytest.raises(
        ValueError,
        match="sem fontes",
    ):
        validate_generated_assessment(assessment)


def test_invalid_source_number_is_rejected():
    assessment = valid_assessment()

    assessment.sources[0].title = "[F3] Fonte com identificador incorreto"

    with pytest.raises(
        ValueError,
        match="Identificador da fonte",
    ):
        validate_generated_assessment(assessment)


@pytest.mark.parametrize("titles", [("[F1] Lei", "[F1] Lei"), ("[F2] Lei", "[F1] Lei")])
def test_duplicate_or_unordered_source_ids_are_rejected(titles):
    assessment = valid_assessment()
    for source, title in zip(assessment.sources, titles, strict=True):
        source.title = title
    with pytest.raises(ValueError, match="Identificador da fonte"):
        validate_generated_assessment(assessment)


def test_uncited_assessment_sources_are_rejected():
    assessment = valid_assessment()
    assessment.content = "Somente a primeira fonte [F1]."
    with pytest.raises(ValueError, match="fontes não citadas"):
        validate_generated_assessment(assessment)


def test_source_without_official_https_is_rejected():
    assessment = valid_assessment()

    assessment.sources[0].excerpt = "Fonte sem endereco oficial HTTPS."

    with pytest.raises(
        ValueError,
        match="Fonte oficial HTTPS ausente",
    ):
        validate_generated_assessment(assessment)


@pytest.mark.parametrize(
    "fallback",
    [
        "A explicacao automatica esta temporariamente indisponivel.",
        "A explicação automática está temporariamente indisponível.",
        "Nenhuma conclusao automatica foi produzida.",
        "Nenhuma conclusão automática foi produzida.",
    ],
)
def test_fallback_messages_are_rejected(fallback):
    assessment = valid_assessment()

    assessment.content = fallback + " [F1]"

    with pytest.raises(
        ValueError,
        match="Mensagem de indisponibilidade",
    ):
        validate_generated_assessment(assessment)


def test_content_above_limit_is_rejected():
    assessment = valid_assessment()

    assessment.content = ("A" * 20001) + " [F1]"

    with pytest.raises(
        ValueError,
        match="Conteudo do parecer invalido",
    ):
        validate_generated_assessment(assessment)


def test_valid_assessment_is_persisted():
    conn = fake_connection(assessment_id=42)

    assessment_id = save_generated_assessment(
        conn,
        alert_id=882,
        assessment=valid_assessment(),
        model="gemini-3.5-flash-lite",
        suggested_typology=None,
        user=LOCAL_USER,
    )

    assert assessment_id == 42
    assert conn.execute.call_count == 2

    sql, params = conn.execute.call_args_list[0].args

    sql_text = str(sql)

    assert "INSERT INTO assessments" in sql_text
    assert "RETURNING id" in sql_text

    assert params["alert_id"] == 882
    assert params["llm_model"] == "gemini-3.5-flash-lite"

    sources = json.loads(params["sources"])
    validation = json.loads(params["validation"])

    assert len(sources) == 2
    assert validation["citations"] == ["F1", "F2"]
    assert validation["source_count"] == 2
    assert validation["requires_human_review"] is True
    assert validation["legal_conclusion_verified"] is False

    # A persistencia nao deve criar uma decisao de analista.
    assert "INSERT INTO decisions" not in sql_text

    audit_sql, audit_params = conn.execute.call_args_list[1].args
    assert "INSERT INTO audit_log" in str(audit_sql)
    assert audit_params["actor"] == LOCAL_USER.name
    assert audit_params["action"] == "assessment_generated"


def test_suggested_typology_updates_alert_in_same_transaction():
    conn = fake_connection(assessment_id=42)

    save_generated_assessment(
        conn,
        alert_id=882,
        assessment=valid_assessment(),
        model="gemini-3.5-flash-lite",
        suggested_typology="fan_out",
        user=LOCAL_USER,
    )

    assert conn.execute.call_count == 3
    update_sql, update_params = conn.execute.call_args_list[1].args
    assert "UPDATE alerts" in str(update_sql)
    assert update_params == {"id": 882, "typology": "Fan-out"}


def test_invalid_assessment_never_reaches_database():
    conn = fake_connection()

    assessment = valid_assessment()
    assessment.content = "Sem referencia juridica."

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


@pytest.mark.parametrize(
    "alert_id",
    [0, -1, True, "882"],
)
def test_invalid_alert_id_is_rejected(alert_id):
    conn = fake_connection()

    with pytest.raises(
        ValueError,
        match="ID do alerta invalido",
    ):
        save_generated_assessment(
            conn,
            alert_id=alert_id,
            assessment=valid_assessment(),
            model="gemini-3.5-flash-lite",
            suggested_typology=None,
            user=LOCAL_USER,
        )

    conn.execute.assert_not_called()


def test_empty_model_is_rejected():
    conn = fake_connection()

    with pytest.raises(
        ValueError,
        match="Modelo Gemini nao informado",
    ):
        save_generated_assessment(
            conn,
            alert_id=882,
            assessment=valid_assessment(),
            model=" ",
            suggested_typology=None,
            user=LOCAL_USER,
        )

    conn.execute.assert_not_called()


def test_invalid_returned_id_is_rejected():
    conn = fake_connection(assessment_id=0)

    with pytest.raises(
        ValueError,
        match="Banco retornou ID",
    ):
        save_generated_assessment(
            conn,
            alert_id=882,
            assessment=valid_assessment(),
            model="gemini-3.5-flash-lite",
            suggested_typology=None,
            user=LOCAL_USER,
        )
