"""Hybrid semantic and lexical retrieval for versioned legal texts."""

import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy import Connection, text

from fraudradar.ai.documents import RetrievedDocument, _vector_to_pg
from fraudradar.ai.embeddings import EmbeddingService

CONCEPTS = {
    "identification": ("identific",),
    "customers": ("client",),
    "registration": ("cadastr",),
    "records": ("registr",),
    "maintenance": ("manutenc", "conserv"),
    "transactions": ("transac", "transacion"),
    "operations": ("operac",),
    "communications": ("comunic",),
    "suspicion": ("suspeit", "indici"),
    "obligations": ("obrigac",),
    "prevention": ("prevenc",),
    "sanctions": (
        "penalid",
        "sanc",
        "multa",
        "advert",
        "inabilit",
    ),
}


@dataclass(frozen=True)
class HybridLegalHit:
    """A retrieved legal document with explainable ranking scores."""

    document: RetrievedDocument
    hybrid_score: float
    lexical_score: float
    semantic_similarity: float
    explicit_article_match: bool


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.lower())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def _concepts(value: str) -> set[str]:
    normalized = _normalize(value)
    return {name for name, stems in CONCEPTS.items() if any(stem in normalized for stem in stems)}


def _explicit_article(value: str) -> str | None:
    normalized = _normalize(value)
    match = re.search(
        r"\b(?:artigo|art\.)\s*(\d+)(?:-([a-z]))?\b",
        normalized,
    )

    if match is None:
        return None

    number, suffix = match.groups()
    return f"Art. {int(number)}" + (f"-{suffix.upper()}" if suffix else "")


def search_hybrid_legal_documents(
    conn: Connection,
    *,
    question: str,
    source_id: str,
    snapshot_sha256: str,
    limit: int = 5,
    include_pending_review: bool = False,
) -> list[HybridLegalHit]:
    """Rank legal chunks using lexical coverage and vector similarity."""
    if not isinstance(question, str) or not question.strip():
        raise ValueError("Pergunta invalida.")

    if not isinstance(source_id, str) or not source_id.strip():
        raise ValueError("Fonte invalida.")

    if not isinstance(snapshot_sha256, str) or not re.fullmatch(
        r"[0-9a-fA-F]{64}",
        snapshot_sha256,
    ):
        raise ValueError("Hash do snapshot invalido.")

    if type(limit) is not int or not 1 <= limit <= 20:
        raise ValueError("Limite deve estar entre 1 e 20.")

    if not isinstance(include_pending_review, bool):
        raise TypeError("Controle de revisao deve ser booleano.")

    query_concepts = _concepts(question)
    requested_article = _explicit_article(question)

    embedding = EmbeddingService().embed_query(question.strip())

    rows = (
        conn.execute(
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
        """),
            {
                "embedding": _vector_to_pg(embedding),
                "source_id": source_id.strip(),
                "snapshot_sha256": snapshot_sha256.lower(),
                "include_pending_review": include_pending_review,
            },
        )
        .mappings()
        .all()
    )

    hits = []

    for row in rows:
        metadata = row["metadata"]
        content_concepts = _concepts(row["content"])
        shared_concepts = query_concepts & content_concepts

        coverage = len(shared_concepts) / len(query_concepts) if query_concepts else 0.0

        exact_match = requested_article is not None and requested_article == metadata.get("article")

        similarity = float(row["similarity"])

        # Experimental weights, to be evaluated on more questions.
        score = 0.65 * coverage + 0.35 * similarity + (2.0 if exact_match else 0.0)

        document = RetrievedDocument(
            id=int(row["id"]),
            source=row["source"],
            chunk_index=int(row["chunk_index"]),
            content=row["content"],
            metadata=metadata,
            similarity=similarity,
        )

        hits.append(
            HybridLegalHit(
                document=document,
                hybrid_score=score,
                lexical_score=coverage,
                semantic_similarity=similarity,
                explicit_article_match=exact_match,
            )
        )

    hits.sort(
        key=lambda hit: (
            -hit.hybrid_score,
            -hit.semantic_similarity,
            hit.document.id,
        )
    )

    return hits[:limit]
