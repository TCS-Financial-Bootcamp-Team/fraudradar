"""Present legal RAG results with safe, auditable evidence."""

from typing import Any

from fraudradar.ai.legal_resilience import LegalRagResult


def present_legal_rag(result: LegalRagResult) -> dict[str, Any]:
    """Convert a legal RAG result into an API-ready response."""
    if not result.documents:
        raise ValueError("Resultado sem evidencias.")

    if len(result.documents) != len(result.citation_ids):
        raise ValueError("Quantidade de citacoes inconsistente.")

    expected_ids = tuple(f"F{index}" for index in range(1, len(result.documents) + 1))

    if result.citation_ids != expected_ids:
        raise ValueError("Identificadores de evidencias invalidos.")

    evidences = []

    for citation_id, document in zip(
        result.citation_ids,
        result.documents,
        strict=True,
    ):
        metadata = document.metadata

        review_status = metadata.get("review_status")

        if review_status not in {"reviewed", "pending_review"}:
            raise ValueError("Status de revisao desconhecido.")

        if not isinstance(document.content, str) or not (document.content.strip()):
            raise ValueError("Evidencia sem conteudo.")

        required = (
            "article",
            "official_url",
            "snapshot_sha256",
        )

        if any(not metadata.get(field) for field in required):
            raise ValueError("Metadados juridicos incompletos.")

        evidences.append(
            {
                "citation_id": citation_id,
                "article": metadata["article"],
                "source": document.source,
                "official_url": metadata["official_url"],
                "snapshot_sha256": metadata["snapshot_sha256"],
                "review_status": review_status,
                "content": document.content,
                "chunk_index": document.chunk_index,
            }
        )

    if result.status == "llm_unavailable":
        if result.answer is not None:
            raise ValueError("Fallback nao pode conter resposta gerada.")

        return {
            "status": "llm_unavailable",
            "message": (
                "A explicacao automatica esta temporariamente "
                "indisponivel. As evidencias juridicas recuperadas "
                "continuam disponiveis para consulta."
            ),
            "answer": None,
            "model": None,
            "grounded": True,
            "citations": [],
            "evidences": evidences,
            "requires_legal_review": any(item["review_status"] != "reviewed" for item in evidences),
        }

    if result.status != "generated":
        raise ValueError("Status do resultado desconhecido.")

    answer = result.answer

    if answer is None or not answer.text.strip():
        raise ValueError("Resposta gerada ausente.")

    valid_ids = set(result.citation_ids)

    if answer.grounded:
        if not answer.citations:
            raise ValueError("Resposta sem citacoes.")

        if not set(answer.citations).issubset(valid_ids):
            raise ValueError("Resposta com referencias inexistentes.")
    elif answer.citations:
        raise ValueError("Resposta sem base nao pode conter citacoes.")

    return {
        "status": "generated",
        "message": "Explicacao automatica gerada.",
        "answer": answer.text,
        "model": answer.model,
        "grounded": answer.grounded,
        "citations": list(answer.citations),
        "evidences": evidences,
        "requires_legal_review": any(item["review_status"] != "reviewed" for item in evidences),
    }
