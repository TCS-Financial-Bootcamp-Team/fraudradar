"""Persiste pareceres de IA validados e sustentados por citações.

Este repositório nunca chama um LLM. A geração precisa terminar antes
da abertura da transação de escrita.

A validação estrutural não substitui revisão jurídica profissional.
"""

from __future__ import annotations

import json
import re

from sqlalchemy import Connection, text

from api.dependencies import User
from api.repositories.audit import write_audit_log
from api.schemas.alerts import Assessment
from fraudradar.ai.alert_assessment import TYPOLOGY_LABELS

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
    """Valida evidências estruturais e citações antes da persistência."""

    if not isinstance(assessment, Assessment):
        raise ValueError("Contrato do parecer invalido.")

    content = assessment.content.strip()

    if not content or len(content) > _MAX_CONTENT:
        raise ValueError("Conteudo do parecer invalido.")

    normalized = content.lower()

    if any(marker in normalized for marker in _FALLBACK_MARKERS):
        raise ValueError("Mensagem de indisponibilidade nao pode ser salva como parecer.")

    sources = assessment.sources

    if not sources or len(sources) > _MAX_SOURCES:
        raise ValueError("Parecer sem fontes validas.")

    expected = tuple(f"F{number}" for number in range(1, len(sources) + 1))

    for citation_id, source in zip(expected, sources, strict=True):
        if not source.title.startswith(f"[{citation_id}]"):
            raise ValueError("Identificador da fonte inconsistente.")

        if not source.excerpt.strip():
            raise ValueError("Fonte juridica sem evidencia.")

        if "Fonte oficial: https://" not in source.excerpt:
            raise ValueError("Fonte oficial HTTPS ausente.")

    found = tuple(dict.fromkeys(f"F{number}" for number in _CITATION.findall(content)))

    if not found:
        raise ValueError("Parecer sem citacoes verificaveis.")

    if not set(found).issubset(set(expected)):
        raise ValueError("Parecer referencia fontes inexistentes.")

    return found


def save_generated_assessment(
    conn: Connection,
    *,
    alert_id: int,
    assessment: Assessment,
    model: str,
    suggested_typology: str | None,
    user: User,
) -> int:
    """Insere parecer, tipologia e auditoria na transação recebida.

    Retorna o ID persistido. Commit e rollback continuam sob responsabilidade
    da chamada.
    """

    if not isinstance(alert_id, int) or isinstance(alert_id, bool):
        raise ValueError("ID do alerta invalido.")

    if alert_id < 1:
        raise ValueError("ID do alerta invalido.")

    if not isinstance(model, str) or not model.strip():
        raise ValueError("Modelo Gemini nao informado.")

    if suggested_typology is not None and suggested_typology not in TYPOLOGY_LABELS:
        raise ValueError("Tipologia sugerida inválida.")

    citations = validate_generated_assessment(
        assessment,
    )

    sources_payload = [source.model_dump() for source in assessment.sources]

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
                suggested_typology,
                sources,
                validation,
                is_valid,
                llm_model
            )
            VALUES (
                :alert_id,
                :content,
                :suggested_typology,
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
            "suggested_typology": suggested_typology,
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
        raise ValueError("Banco retornou ID de parecer invalido.")

    if suggested_typology is not None:
        conn.execute(
            text("UPDATE alerts SET typology = :typology, updated_at = now() WHERE id = :id"),
            {
                "id": alert_id,
                "typology": TYPOLOGY_LABELS[suggested_typology],
            },
        )

    write_audit_log(
        conn,
        alert_id=alert_id,
        user=user,
        action="assessment_generated",
        details={
            "assessment_id": assessment_id,
            "llm_model": model.strip(),
            "suggested_typology": suggested_typology,
        },
    )
    return assessment_id
