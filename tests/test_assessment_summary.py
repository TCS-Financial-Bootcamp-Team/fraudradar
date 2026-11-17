"""Testes puros da prévia de pareceres novos e legados."""

import pytest

from api.schemas.alerts import Assessment
from fraudradar.ai.alert_assessment import assessment_summary


@pytest.mark.parametrize(
    "heading",
    ["## Resumo", "# RESUMO", "###### résumó", "  ### **Resumo** ###", "**Resumo**"],
)
def test_extracts_summary_until_next_heading(heading):
    content = (
        f"# Parecer\n\n{heading}\n\nRisco alto: 91,5.\nVerifique o principal sinal.\n\n"
        "## Sinais de risco\n- Muitas contrapartes.\n## Fundamentação jurídica\nDeveres [F2]."
    )
    assert assessment_summary(content) == "Risco alto: 91,5. Verifique o principal sinal."


def test_bold_heading_stops_at_next_bold_section():
    assert (
        assessment_summary(
            "**Resumo**\n\nConfira **o sinal principal** [F2].\n\n**Limitações**\nRevisão humana."
        )
        == "Confira o sinal principal [F2]."
    )


def test_legacy_uses_first_non_heading_paragraph():
    assert (
        assessment_summary(
            "# Parecer antigo\n\nPrimeira frase.\nSegunda frase.\n\nOutro parágrafo [F1]."
        )
        == "Primeira frase. Segunda frase."
    )


def test_long_legacy_paragraph_cuts_at_sentence_boundary():
    sentence = "Confira as operações e os sinais antes de decidir."
    first_paragraph = " ".join([sentence] * 20)
    summary = assessment_summary(first_paragraph + "\n\nNão incluir o segundo parágrafo.")
    assert 250 <= len(summary) <= 361
    assert summary.endswith(".…")
    assert first_paragraph.startswith(summary[:-1])


def test_long_legacy_without_sentence_boundary_uses_word_boundary():
    summary = assessment_summary("operacao " * 100)
    assert 280 <= len(summary) <= 301
    assert summary.endswith("operacao…")


@pytest.mark.parametrize("content", ["", "curto", "# Só um título", "**Resumo**", "   ", "#"])
def test_non_empty_content_always_has_a_summary(content):
    summary = assessment_summary(content)
    assert bool(summary) == bool(content)


def test_empty_summary_section_falls_back_to_legacy_paragraph():
    assert assessment_summary("## Resumo\n\n## Sinais\nSinal observado [F1].") == (
        "Sinal observado [F1]."
    )


def test_schema_derives_summary_and_ignores_supplied_summary():
    assessment = Assessment.model_validate(
        {
            "content": "## Resumo\nPrévia curta.\n## Sinais\nDetalhes.",
            "sources": [],
            "summary": "Texto que não corresponde ao conteúdo.",
        }
    )
    assert assessment.model_dump()["summary"] == "Prévia curta."
    assessment.content = "Parecer legado.\n\nOutros detalhes."
    assert assessment.summary == "Parecer legado."
