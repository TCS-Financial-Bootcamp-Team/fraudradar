"""Adapt reviewed legal RAG results to the existing chat contract."""

from typing import Any

from api.schemas.alerts import Source
from api.schemas.chat import ChatResponse


def legal_payload_to_chat_response(
    payload: dict[str, Any],
) -> ChatResponse:
    """Map reviewed legal evidence to the existing frontend contract.

    Unreviewed evidence is never exposed by this adapter.
    """
    status = payload.get("status")

    if status not in {"generated", "llm_unavailable"}:
        raise ValueError("Status juridico invalido.")

    evidences = payload.get("evidences")

    if not isinstance(evidences, list) or not evidences:
        raise ValueError("Evidencias juridicas ausentes.")

    if payload.get("requires_legal_review") is not False:
        raise ValueError("Resultado ainda depende de revisao juridica.")

    expected_ids = [
        f"F{index}"
        for index in range(1, len(evidences) + 1)
    ]

    actual_ids = [
        item.get("citation_id")
        for item in evidences
    ]

    if actual_ids != expected_ids:
        raise ValueError("Identificadores de evidencias invalidos.")

    sources = []

    for evidence in evidences:
        if evidence.get("review_status") != "reviewed":
            raise ValueError("Documento juridico nao revisado.")

        article = evidence.get("article")
        official_url = evidence.get("official_url")
        content = evidence.get("content")

        if not all(
            isinstance(value, str) and value.strip()
            for value in (article, official_url, content)
        ):
            raise ValueError("Evidencia juridica incompleta.")

        if not official_url.startswith("https://"):
            raise ValueError("URL da fonte juridica invalida.")

        citation_id = evidence["citation_id"]

        # The frontend currently displays source titles.
        title = f"[{citation_id}] {article} - Fonte juridica"

        # This is a preview, not the complete legal evidence.
        preview = content[:500]

        if len(content) > 500:
            preview += "..."

        excerpt = (
            f"{preview}\n\n"
            f"Fonte oficial: {official_url}"
        )

        sources.append(
            Source(
                title=title,
                excerpt=excerpt,
            )
        )

    if status == "llm_unavailable":
        if payload.get("answer") is not None:
            raise ValueError("Fallback contem resposta gerada.")

        answer = (
            "A explicacao automatica esta temporariamente "
            "indisponivel. Consulte as fontes juridicas "
            "recuperadas abaixo. Nenhuma conclusao automatica "
            "foi produzida."
        )

    else:
        answer = payload.get("answer")
        citations = payload.get("citations")

        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("Resposta gerada ausente.")

        if not isinstance(citations, list) or not citations:
            raise ValueError("Citacoes da resposta ausentes.")

        if not all(
            citation in expected_ids
            for citation in citations
        ):
            raise ValueError("Resposta com citacao desconhecida.")

    return ChatResponse(
        answer=answer,
        sources=sources,
    )
