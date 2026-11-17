"""Adapta resultados jurídicos revisados ao contrato existente do chat."""

import re
from typing import Any

from api.schemas.alerts import Source
from api.schemas.chat import ChatResponse

LLM_UNAVAILABLE_ANSWER = (
    "A explicação automática está temporariamente "
    "indisponível. Consulte as fontes jurídicas "
    "recuperadas abaixo. Nenhuma conclusão automática "
    "foi produzida."
)


def cited_sources(content: str, sources: list[Source]) -> list[Source]:
    """Filtra fontes pelos IDs citados, preservando IDs antigos e ordenando pelo número."""
    # Pareceres legados também podem usar [1], antes da adoção de [F1].
    identifiers = set(re.findall(r"\[(F?[1-9][0-9]*)\]", content))
    selected: list[tuple[int, Source]] = []
    for source in sources:
        match = re.match(r"^\[(F?[1-9][0-9]*)\](?:\s|$)", source.title)
        if match is not None and match[1] in identifiers:
            selected.append((int(match[1].removeprefix("F")), source))
    return [source for _, source in sorted(selected, key=lambda item: item[0])]


def legal_payload_to_chat_response(
    payload: dict[str, Any],
) -> ChatResponse:
    """Converte evidências revisadas para o contrato existente do frontend.

    Este adaptador nunca expõe evidências que ainda não foram revisadas.
    """
    status = payload.get("status")

    if status not in {"generated", "llm_unavailable"}:
        raise ValueError("Status juridico invalido.")

    evidences = payload.get("evidences")

    if not isinstance(evidences, list) or not evidences:
        raise ValueError("Evidencias juridicas ausentes.")

    if payload.get("requires_legal_review") is not False:
        raise ValueError("Resultado ainda depende de revisao juridica.")

    expected_ids = [f"F{index}" for index in range(1, len(evidences) + 1)]

    actual_ids = [item.get("citation_id") for item in evidences]

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
            isinstance(value, str) and value.strip() for value in (article, official_url, content)
        ):
            raise ValueError("Evidencia juridica incompleta.")

        if not official_url.startswith("https://"):
            raise ValueError("URL da fonte juridica invalida.")

        citation_id = evidence["citation_id"]

        # O frontend exibe os títulos das fontes.
        title = f"[{citation_id}] Lei 9.613/1998, {article}"

        # O trecho é uma prévia, não a evidência jurídica completa.
        preview = content[:500]

        if len(content) > 500:
            preview += "..."

        excerpt = f"{preview}\n\nFonte oficial: {official_url}"

        sources.append(
            Source(
                title=title,
                excerpt=excerpt,
            )
        )

    if status == "llm_unavailable":
        if payload.get("answer") is not None:
            raise ValueError("Fallback contem resposta gerada.")

        answer = LLM_UNAVAILABLE_ANSWER

    else:
        answer = payload.get("answer")
        citations = payload.get("citations")

        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("Resposta gerada ausente.")

        if not isinstance(citations, list) or not citations:
            raise ValueError("Citacoes da resposta ausentes.")

        if not all(citation in expected_ids for citation in citations):
            raise ValueError("Resposta com citacao desconhecida.")

        actual_citations = set(re.findall(r"\[(F[0-9]+)\]", answer))
        if not actual_citations.issubset(expected_ids):
            raise ValueError("Resposta com citação desconhecida.")
        if actual_citations != set(citations):
            raise ValueError("Citações da resposta inconsistentes.")
        sources = cited_sources(answer, sources)

    return ChatResponse(
        answer=answer,
        sources=sources,
    )
