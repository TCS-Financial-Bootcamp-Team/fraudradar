"""Persist validated, citation-backed AI assessments.

This repository never invokes an LLM. The caller must complete
generation before opening a write transaction.

Structural validation does not replace professional legal review.
"""

from __future__ import annotations

import json
import re

from sqlalchemy import Connection, text

from api.schemas.alerts import Assessment


_CITATION = re.compile(r"\[F([1-9][0-9]*)\]")

_FALLBACK_MARKERS = (
    "explicacao automatica esta temporariamente indisponivel",
    "explicação automática está temporariamente indisponível",
    "nenhuma conclusao automatica foi produzida",
    "nenhuma conclusão automática foi produzida",
)

_MAX_CONTENT = 20000
_MAX_SOURCES = 10


def validate_generated_assessment(
    assessment: Assessment,
) -> tuple[str, ...]:
    """Validate structural evidence and citations before persistence."""

    if not isinstance(assessment, Assessment):
        raise ValueError("Contrato do parecer invalido.")

    content = assessment.content.strip()

    if not content or len(content) > _MAX_CONTENT:
        raise ValueError("Conteudo do parecer invalido.")

    normalized = content.lower()

    if any(marker in normalized for marker in _FALLBACK_MARKERS):
        raise ValueError(
            "Mensagem de indisponibilidade nao pode ser salva como parecer."
        )

    sources = assessment.sources

    if not sources or len(sources) > _MAX_SOURCES:
        raise ValueError("Parecer sem fontes validas.")

    expected = tuple(
        f"F{number}"
        for number in range(1, len(sources) + 1)
    )

    for citation_id, source in zip(expected, sources, strict=True):
        if not source.title.startswith(f"[{citation_id}]"):
            raise ValueError(
                "Identificador da fonte inconsistente."
            )

        if not source.excerpt.strip():
            raise ValueError(
                "Fonte juridica sem evidencia."
            )

        if "Fonte oficial: https://" not in source.excerpt:
            raise ValueError(
                "Fonte oficial HTTPS ausente."
            )

    found = tuple(
        dict.fromkeys(
            f"F{number}"
            for number in _CITATION.findall(content)
        )
    )

    if not found:
        raise ValueError(
            "Parecer sem citacoes verificaveis."
        )

    if not set(found).issubset(set(expected)):
        raise ValueError(
            "Parecer referencia fontes inexistentes."
        )

    return found


def save_generated_assessment(
    conn: Connection,
    *,
    alert_id: int,
    assessment: Assessment,
    model: str,
) -> int:
    """Insert a validated assessment inside the caller transaction.

    Returns the persisted assessment ID. Transaction commit and
    rollback remain the responsibility of the caller.
    """

    if not isinstance(alert_id, int) or isinstance(alert_id, bool):
        raise ValueError("ID do alerta invalido.")

    if alert_id < 1:
        raise ValueError("ID do alerta invalido.")

    if not isinstance(model, str) or not model.strip():
        raise ValueError("Modelo Gemini nao informado.")

    citations = validate_generated_assessment(
        assessment,
    )

    sources_payload = [
        source.model_dump()
        for source in assessment.sources
    ]

    validation_payload = {
        "schema_version": 1,
        "type": "structural_citation_validation",
        "citations": list(citations),
        "source_count": len(sources_payload),
        "requires_human_review": True,
        "legal_conclusion_verified": False,
    }

    result = conn.execute(
        text(
            """
            INSERT INTO assessments (
                alert_id,
                content,
                sources,
                validation,
                is_valid,
                llm_model
            )
            VALUES (
                :alert_id,
                :content,
                CAST(:sources AS jsonb),
                CAST(:validation AS jsonb),
                TRUE,
                :llm_model
            )
            RETURNING id
            """
        ),
        {
            "alert_id": alert_id,
            "content": assessment.content.strip(),
            "sources": json.dumps(
                sources_payload,
                ensure_ascii=False,
            ),
            "validation": json.dumps(
                validation_payload,
                ensure_ascii=False,
            ),
            "llm_model": model.strip(),
        },
    )

    assessment_id = result.scalar_one()

    if not isinstance(assessment_id, int) or assessment_id < 1:
        raise ValueError(
            "Banco retornou ID de parecer invalido."
        )

    return assessment_id