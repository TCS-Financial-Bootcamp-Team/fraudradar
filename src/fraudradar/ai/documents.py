"""Persistence and semantic retrieval for FraudRadar RAG documents."""

import json
from dataclasses import dataclass
from typing import Any

import numpy as np
from sqlalchemy import Connection, text


def _vector_to_pg(vector: np.ndarray) -> str:
    """Serialize a finite embedding for the pgvector SQL type."""
    array = np.asarray(vector, dtype=np.float32)

    if array.shape != (384,):
        raise ValueError("O embedding deve ter 384 dimensoes.")

    if not np.isfinite(array).all():
        raise ValueError("O embedding contem valores invalidos.")

    return "[" + ",".join(
        format(float(value), ".9g")
        for value in array
    ) + "]"


@dataclass(frozen=True)
class RetrievedDocument:
    """A document chunk returned by semantic search."""

    id: int
    source: str
    chunk_index: int
    content: str
    metadata: dict[str, Any]
    similarity: float


class RagDocumentRepository:
    """Read and write RAG documents using an existing SQLAlchemy connection."""

    def __init__(self, conn: Connection) -> None:
        self.conn = conn

    def add_chunk(
        self,
        *,
        source: str,
        chunk_index: int,
        content: str,
        embedding: np.ndarray,
        metadata: dict[str, Any] | None = None,
    ) -> int:
        """Insert one document chunk without committing the transaction."""
        if not source.strip():
            raise ValueError("A fonte nao pode estar vazia.")

        if chunk_index < 0:
            raise ValueError("chunk_index nao pode ser negativo.")

        if not content.strip():
            raise ValueError("O conteudo nao pode estar vazio.")

        result = self.conn.execute(
            text("""
                INSERT INTO rag_documents
                    (source, chunk_index, content, metadata, embedding)
                VALUES
                    (
                        :source,
                        :chunk_index,
                        :content,
                        CAST(:metadata AS jsonb),
                        CAST(:embedding AS vector)
                    )
                RETURNING id
            """),
            {
                "source": source,
                "chunk_index": chunk_index,
                "content": content,
                "metadata": json.dumps(
                    metadata if metadata is not None else {},
                    ensure_ascii=False,
                ),
                "embedding": _vector_to_pg(embedding),
            },
        )

        return int(result.scalar_one())

    def search(
        self,
        embedding: np.ndarray,
        *,
        limit: int = 5,
        source: str | None = None,
    ) -> list[RetrievedDocument]:
        """Retrieve document chunks ranked by cosine similarity."""
        if not 1 <= limit <= 20:
            raise ValueError("O limite deve estar entre 1 e 20.")

        rows = self.conn.execute(
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
                WHERE (
                    CAST(:source AS text) IS NULL
                    OR source = CAST(:source AS text)
                )
                ORDER BY
                    embedding <=> CAST(:embedding AS vector),
                    id
                LIMIT :limit
            """),
            {
                "embedding": _vector_to_pg(embedding),
                "source": source,
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
