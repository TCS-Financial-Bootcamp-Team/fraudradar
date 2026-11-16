"""Resilient legal RAG orchestration with a safe 503 fallback."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import Connection

from fraudradar.ai.documents import RetrievedDocument
from fraudradar.ai.legal_context import format_legal_context
from fraudradar.ai.legal_generation import (
    LegalAnswer,
    generate_legal_answer_from_settings,
)
from fraudradar.ai.legal_hybrid import search_hybrid_legal_documents


@dataclass(frozen=True)
class LegalRagResult:
    """Result of legal retrieval and optional LLM generation."""

    status: Literal["generated", "llm_unavailable"]
    answer: LegalAnswer | None
    documents: tuple[RetrievedDocument, ...]
    citation_ids: tuple[str, ...]


def _is_http_503(error: Exception) -> bool:
    """Recognize an HTTP 503 without parsing error messages."""
    candidates = [
        getattr(error, "status_code", None),
        getattr(error, "code", None),
    ]

    response = getattr(error, "response", None)

    if response is not None:
        candidates.append(getattr(response, "status_code", None))

    return any(value == 503 or value == "503" for value in candidates)


def run_legal_rag(
    conn: Connection,
    *,
    question: str,
    source_id: str,
    snapshot_sha256: str,
    include_pending_review: bool = False,
    generator: Callable[..., LegalAnswer] | None = None,
    max_total_chars: int = 5000,
) -> LegalRagResult:
    """Retrieve legal evidence and generate or safely fall back.

    A 503 affects only the generative explanation. Retrieved legal
    evidence remains available, with its original review status.

    Other exceptions propagate to the caller.
    """
    if generator is None:
        generator = generate_legal_answer_from_settings

    hits = search_hybrid_legal_documents(
        conn,
        question=question,
        source_id=source_id,
        snapshot_sha256=snapshot_sha256,
        limit=5,
        include_pending_review=include_pending_review,
    )

    if not hits:
        raise ValueError("Nenhuma evidencia juridica autorizada foi recuperada.")

    context = None
    documents = None

    # Keep complete chunks. Never silently truncate legal evidence.
    for count in range(min(3, len(hits)), 0, -1):
        candidates = tuple(hit.document for hit in hits[:count])

        try:
            formatted = format_legal_context(
                candidates,
                max_documents=count,
                max_total_chars=max_total_chars,
                allow_pending_review=include_pending_review,
            )
        except ValueError:
            continue

        context = formatted
        documents = candidates
        break

    if context is None or documents is None:
        raise ValueError("As evidencias nao cabem no limite de contexto.")

    citation_ids = tuple(f"F{index}" for index in range(1, len(documents) + 1))

    try:
        answer = generator(
            question=question,
            context=context,
            allow_pending_review=include_pending_review,
        )
    except Exception as error:
        if not _is_http_503(error):
            raise

        return LegalRagResult(
            status="llm_unavailable",
            answer=None,
            documents=documents,
            citation_ids=citation_ids,
        )

    return LegalRagResult(
        status="generated",
        answer=answer,
        documents=documents,
        citation_ids=citation_ids,
    )
