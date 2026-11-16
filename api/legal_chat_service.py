"""Orchestrate legal chat while keeping the DB connection short-lived."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import Engine

from api.schemas.chat import ChatResponse
from fraudradar.ai.legal_chat_adapter import legal_payload_to_chat_response
from fraudradar.ai.legal_generation import LegalAnswer
from fraudradar.ai.legal_pipeline import generate_from_prepared_evidence
from fraudradar.ai.legal_presentation import present_legal_rag
from fraudradar.ai.legal_retrieval import (
    PreparedLegalEvidence,
    prepare_legal_evidence,
)
from fraudradar.db import get_engine


class LegalEvidenceUnavailableError(Exception):
    """No approved legal evidence is available for the question."""


def _active_legal_source() -> tuple[str, str]:
    """Identify the versioned legal snapshot used by this deployment."""
    root = Path(__file__).resolve().parents[1]
    snapshots = sorted(
        (root / "rag" / "snapshots").glob("lei-9613-1998-*.json")
    )

    if len(snapshots) != 1:
        raise LegalEvidenceUnavailableError(
            "Fonte juridica versionada nao configurada."
        )

    snapshot = json.loads(
        snapshots[0].read_text(encoding="utf-8-sig")
    )

    source_id = snapshot.get("source_id")
    snapshot_sha256 = snapshot.get("text_sha256")

    if (
        not isinstance(source_id, str)
        or source_id != "lei-9613-1998"
        or not isinstance(snapshot_sha256, str)
        or len(snapshot_sha256) != 64
    ):
        raise LegalEvidenceUnavailableError(
            "Metadados da fonte juridica invalidos."
        )

    return source_id, snapshot_sha256


def answer_legal_chat(
    question: str,
    *,
    engine: Engine | None = None,
    generator: Callable[..., LegalAnswer] | None = None,
    retriever: Callable[..., PreparedLegalEvidence] | None = None,
) -> ChatResponse:
    """Prepare reviewed evidence, close DB, then generate a chat answer.

    Pending-review evidence is never enabled by this service.
    Any test doubles must be injected explicitly by the caller.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Pergunta juridica vazia.")

    if len(question) > 2000:
        raise ValueError("Pergunta juridica excede 2000 caracteres.")

    source_id, snapshot_sha256 = _active_legal_source()

    if engine is None:
        engine = get_engine()

    if retriever is None:
        retriever = prepare_legal_evidence

    # Do not call Gemini inside this connection context.
    with engine.connect() as conn:
        try:
            prepared = retriever(
                conn,
                question=question,
                source_id=source_id,
                snapshot_sha256=snapshot_sha256,
                include_pending_review=False,
                max_documents=3,
                max_total_chars=5000,
            )
        except ValueError as error:
            if "Nenhuma evidencia juridica autorizada" not in str(error):
                raise

            raise LegalEvidenceUnavailableError(
                "Nenhuma fonte juridica aprovada foi encontrada."
            ) from error

    # The connection has been closed before entering the LLM phase.
    result = generate_from_prepared_evidence(
        question=question,
        prepared=prepared,
        generator=generator,
        allow_pending_review=False,
    )

    payload: dict[str, Any] = present_legal_rag(result)
    return legal_payload_to_chat_response(payload)
