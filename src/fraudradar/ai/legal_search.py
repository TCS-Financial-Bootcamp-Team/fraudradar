"""Version-scoped legal retrieval with document review controls."""

import re

from sqlalchemy import Connection, text

from fraudradar.ai.documents import RetrievedDocument, _vector_to_pg
from fraudradar.ai.embeddings import EmbeddingService


def search_legal_documents(
    conn: Connection,
    *,
    question: str,
    source_id: str,
    snapshot_sha256: str,
    limit: int = 5,
    include_pending_review: bool = False,
) -> list[RetrievedDocument]:
    """Retrieve legal chunks from one exact document version.

    By default only reviewed chunks are eligible.
    Pending-review chunks require an explicit development-only opt-in.
    """
    if not isinstance(question, str) or not question.strip():
        raise ValueError("A pergunta nao pode estar vazia.")

    if not isinstance(source_id, str) or not source_id.strip():
        raise ValueError("Identificador da fonte invalido.")

    if not isinstance(snapshot_sha256, str) or not re.fullmatch(
        r"[0-9a-fA-F]{64}", snapshot_sha256
    ):
        raise ValueError("SHA-256 do snapshot invalido.")

    if not 1 <= limit <= 20:
        raise ValueError("O limite deve estar entre 1 e 20.")

    if not isinstance(include_pending_review, bool):
        raise TypeError("include_pending_review deve ser booleano.")

    service = EmbeddingService()
    query_vector = service.embed_query(question.strip())

    rows = conn.execute(
        text("""
            SELECT
                id,
                source,
                chunk_index,
                content,
                metadata,
                1 - (
                    embedding <=> CAST(:embedding AS vector)
                ) AS similarity
            FROM rag_documents
            WHERE metadata->>'source_id' = :source_id
              AND metadata->>'snapshot_sha256' = :snapshot_sha256
              AND (
                  metadata->>'review_status' = 'reviewed'
                  OR (
                      CAST(:include_pending_review AS boolean)
                      AND metadata->>'review_status' = 'pending_review'
                  )
              )
            ORDER BY
                embedding <=> CAST(:embedding AS vector),
                id
            LIMIT :limit
        """),
        {
            "embedding": _vector_to_pg(query_vector),
            "source_id": source_id.strip(),
            "snapshot_sha256": snapshot_sha256.lower(),
            "include_pending_review": include_pending_review,
            "limit": limit,
        },
    ).mappings().all()

    return [
        RetrievedDocument(
            id=int(row["id"]),
            source=row["source"],
            chunk_index=int(row["chunk_index"]),
            content=row["content"],
            metadata=row["metadata"],
            similarity=float(row["similarity"]),
        )
        for row in rows
    ]
