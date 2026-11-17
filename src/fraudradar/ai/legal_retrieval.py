"""Prepare legal evidence before any external LLM request."""

from dataclasses import dataclass

from sqlalchemy import Connection

from fraudradar.ai.documents import RetrievedDocument
from fraudradar.ai.legal_context import format_legal_context
from fraudradar.ai.legal_generation import _parse_context
from fraudradar.ai.legal_hybrid import search_hybrid_legal_documents


@dataclass(frozen=True)
class PreparedLegalEvidence:
    """Evidence and prompt context independent of a database connection."""

    documents: tuple[RetrievedDocument, ...]
    context: str
    citation_ids: tuple[str, ...]


def prepare_legal_evidence(
    conn: Connection,
    *,
    question: str,
    source_id: str,
    snapshot_sha256: str,
    include_pending_review: bool = False,
    max_documents: int = 3,
    max_total_chars: int = 5000,
) -> PreparedLegalEvidence:
    """Retrieve and format legal evidence, without calling an LLM.

    Pending-review documents are excluded by default.
    The returned data can be used after the connection is closed.
    """
    if not question.strip():
        raise ValueError("Pergunta juridica vazia.")

    if max_documents < 1:
        raise ValueError("max_documents deve ser positivo.")

    if max_total_chars < 1:
        raise ValueError("max_total_chars deve ser positivo.")

    hits = search_hybrid_legal_documents(
        conn,
        question=question,
        source_id=source_id,
        snapshot_sha256=snapshot_sha256,
        limit=max_documents,
        include_pending_review=include_pending_review,
    )

    if not hits:
        raise ValueError("Nenhuma evidencia juridica autorizada foi recuperada.")

    for count in range(min(max_documents, len(hits)), 0, -1):
        documents = tuple(hit.document for hit in hits[:count])

        try:
            context = format_legal_context(
                documents,
                max_documents=count,
                max_total_chars=max_total_chars,
                allow_pending_review=include_pending_review,
            )
            evidence = _parse_context(
                context,
                allow_pending_review=include_pending_review,
            )
        except ValueError:
            continue

        if len(evidence) != len(documents):
            continue

        citation_ids = tuple(item["citation_id"] for item in evidence)

        return PreparedLegalEvidence(
            documents=documents,
            context=context,
            citation_ids=citation_ids,
        )

    raise ValueError("As evidencias nao cabem no limite de contexto.")
