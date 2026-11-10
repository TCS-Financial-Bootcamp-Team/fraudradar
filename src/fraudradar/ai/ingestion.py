"""Document ingestion pipeline for FraudRadar RAG."""

from typing import Any

from sqlalchemy import Connection, text

from fraudradar.ai.chunking import split_document
from fraudradar.ai.documents import RagDocumentRepository
from fraudradar.ai.embeddings import EmbeddingService


def ingest_document(
    conn: Connection,
    *,
    source: str,
    content: str,
    metadata: dict[str, Any],
    max_chars: int = 1000,
    overlap_chars: int = 150,
) -> list[int]:
    """Chunk, embed and insert one new document.

    The caller controls the transaction. This function does not commit.
    A source must be unique; versioned documents should use distinct IDs.
    """
    if not isinstance(source, str) or not source.strip():
        raise ValueError("A fonte precisa ter um identificador valido.")

    if not isinstance(content, str) or not content.strip():
        raise ValueError("O documento nao pode estar vazio.")

    if not isinstance(metadata, dict):
        raise TypeError("Os metadados precisam ser um dicionario.")

    source = source.strip()

    chunks = split_document(
        content,
        max_chars=max_chars,
        overlap_chars=overlap_chars,
    )

    if not chunks:
        raise ValueError("Nenhum trecho foi gerado.")

    # Prevent silently mixing versions or appending duplicated chunks.
    existing = conn.execute(
        text("""
            SELECT EXISTS (
                SELECT 1
                FROM rag_documents
                WHERE source = :source
            )
        """),
        {"source": source},
    ).scalar_one()

    if existing:
        raise ValueError(
            f"A fonte {source!r} ja possui trechos cadastrados."
        )

    service = EmbeddingService()

    vectors = service.embed_documents(
        [chunk.content for chunk in chunks]
    )

    repository = RagDocumentRepository(conn)
    document_ids = []

    for chunk, vector in zip(chunks, vectors, strict=True):
        chunk_metadata = {
            **metadata,
            "start_char": chunk.start_char,
            "end_char": chunk.end_char,
            "chunk_index": chunk.index,
            "embedding_model": service.model_name,
        }

        document_id = repository.add_chunk(
            source=source,
            chunk_index=chunk.index,
            content=chunk.content,
            embedding=vector,
            metadata=chunk_metadata,
        )

        document_ids.append(document_id)

    return document_ids
