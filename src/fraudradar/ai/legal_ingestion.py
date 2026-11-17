"""Prepare and load versioned legal articles for FraudRadar RAG ingestion.

`python -m worker rag-load` calls load_legal_snapshot for each file in rag/snapshots/.
"""

import hashlib
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Connection, text

from fraudradar.ai.chunking import split_document
from fraudradar.ai.ingestion import ingest_document
from fraudradar.config import get_settings


@dataclass(frozen=True)
class PreparedLegalArticle:
    """One versioned legal article ready for the ingestion pipeline."""

    source: str
    reference: str
    content: str
    metadata: dict[str, Any]
    expected_chunks: int


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def prepare_legal_snapshot(
    snapshot: dict[str, Any],
    *,
    max_chars: int = 900,
    overlap_chars: int = 120,
) -> list[PreparedLegalArticle]:
    """Validate a snapshot and prepare independently versioned articles."""
    if snapshot.get("schema_version") != 1:
        raise ValueError("Versao de snapshot nao suportada.")

    if snapshot.get("review_status") not in {
        "pending_review",
        "reviewed",
    }:
        raise ValueError("Status de revisao invalido.")

    source_id = snapshot.get("source_id")
    text_hash = snapshot.get("text_sha256")
    articles = snapshot.get("articles")

    if not isinstance(source_id, str) or not source_id.strip():
        raise ValueError("Identificador da fonte invalido.")

    if not isinstance(text_hash, str) or len(text_hash) != 64:
        raise ValueError("Hash do snapshot invalido.")

    if not isinstance(articles, list) or not articles:
        raise ValueError("Snapshot sem artigos.")

    if snapshot.get("article_count") != len(articles):
        raise ValueError("Quantidade de artigos inconsistente.")

    full_text = "\n\n".join(article["content"] for article in articles)

    if _sha256(full_text) != text_hash:
        raise ValueError("Hash do texto completo nao confere.")

    prepared = []
    seen_references = set()
    seen_sources = set()

    for article in articles:
        reference = article["reference"]
        content = article["content"]
        article_hash = article["content_sha256"]

        if reference in seen_references:
            raise ValueError(f"Artigo duplicado: {reference}")

        seen_references.add(reference)

        if _sha256(content) != article_hash:
            raise ValueError(f"Hash do artigo nao confere: {reference}")

        if not content.startswith("Art."):
            raise ValueError(f"Conteudo juridico inesperado: {reference}")

        chunks = split_document(
            content,
            max_chars=max_chars,
            overlap_chars=overlap_chars,
        )

        if not chunks:
            raise ValueError(f"Artigo sem chunks: {reference}")

        # Each article has its own chunk indexes starting at zero.
        # The snapshot hash distinguishes different text versions.
        article_key = reference.replace(" ", "").lower()

        source = f"{source_id}:{text_hash[:16]}:{article_key}"

        if source in seen_sources:
            raise ValueError(f"Fonte duplicada: {source}")

        seen_sources.add(source)

        metadata = {
            "source_id": source_id,
            "title": snapshot["title"],
            "authority": snapshot["authority"],
            "official_url": snapshot["official_url"],
            "article": reference,
            "article_sha256": article_hash,
            "snapshot_sha256": text_hash,
            "retrieved_at_utc": snapshot["retrieved_at_utc"],
            "review_status": snapshot["review_status"],
            "document_type": snapshot["document_type"],
            "publication_date": snapshot["publication_date"],
            "version_policy": snapshot["version_policy"],
            "chunking_max_chars": max_chars,
            "chunking_overlap_chars": overlap_chars,
        }

        prepared.append(
            PreparedLegalArticle(
                source=source,
                reference=reference,
                content=content,
                metadata=metadata,
                expected_chunks=len(chunks),
            )
        )

    return prepared


@dataclass(frozen=True)
class LegalSnapshotLoad:
    """What load_legal_snapshot did with one snapshot."""

    source_id: str
    review_status: str
    articles: int
    chunks: int
    loaded: bool
    replaced_chunks: int


def load_legal_snapshot(
    conn: Connection,
    snapshot: dict[str, Any],
) -> LegalSnapshotLoad:
    """Make rag_documents match one snapshot. The caller controls the transaction.

    Each source carries the snapshot hash, so the same source always holds the same
    text. When every article already has its chunks, with the snapshot review status
    and the configured embedding model, nothing changes and nothing is embedded.
    Otherwise the chunks of the snapshot sources are deleted and inserted again, which
    also applies an approval (pending_review -> reviewed) or a new embedding model.
    Chunks of other snapshot versions are kept: the chat filters by the active hash.
    """
    articles = prepare_legal_snapshot(snapshot)
    review_status = snapshot["review_status"]
    sources = [article.source for article in articles]
    expected = {article.source: article.expected_chunks for article in articles}
    chunks = sum(expected.values())

    rows = conn.execute(
        text("""
            SELECT
                source,
                count(*) AS chunks,
                bool_and(
                    coalesce(
                        metadata->>'review_status' = :review_status
                        AND metadata->>'embedding_model' = :embedding_model,
                        false
                    )
                ) AS up_to_date
            FROM rag_documents
            WHERE source = ANY(:sources)
            GROUP BY source
        """),
        {
            "sources": sources,
            "review_status": review_status,
            "embedding_model": get_settings().embedding_model,
        },
    ).all()

    stored = {row.source: (row.chunks, row.up_to_date) for row in rows}

    if stored == {source: (count, True) for source, count in expected.items()}:
        return LegalSnapshotLoad(
            source_id=snapshot["source_id"],
            review_status=review_status,
            articles=len(articles),
            chunks=chunks,
            loaded=False,
            replaced_chunks=0,
        )

    replaced = conn.execute(
        text("DELETE FROM rag_documents WHERE source = ANY(:sources)"),
        {"sources": sources},
    ).rowcount

    for article in articles:
        # The same chunking that prepare_legal_snapshot measured and recorded.
        ids = ingest_document(
            conn,
            source=article.source,
            content=article.content,
            metadata=article.metadata,
            max_chars=article.metadata["chunking_max_chars"],
            overlap_chars=article.metadata["chunking_overlap_chars"],
        )

        if len(ids) != article.expected_chunks:
            raise ValueError(f"Quantidade de trechos inesperada: {article.reference}")

    return LegalSnapshotLoad(
        source_id=snapshot["source_id"],
        review_status=review_status,
        articles=len(articles),
        chunks=chunks,
        loaded=True,
        replaced_chunks=replaced,
    )
