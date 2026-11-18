"""Generate a legal answer from evidence prepared before closing the DB."""

from collections.abc import Callable

from fraudradar.ai.legal_generation import (
    CHAT_MAX_OUTPUT_TOKENS,
    SYSTEM_INSTRUCTION,
    LegalAnswer,
    generate_legal_answer_from_settings,
)
from fraudradar.ai.legal_resilience import LegalRagResult, _is_http_503
from fraudradar.ai.legal_retrieval import PreparedLegalEvidence


def generate_from_prepared_evidence(
    *,
    question: str,
    prepared: PreparedLegalEvidence,
    generator: Callable[..., LegalAnswer] | None = None,
    allow_pending_review: bool = False,
    system_instruction: str = SYSTEM_INSTRUCTION,
    max_output_tokens: int = CHAT_MAX_OUTPUT_TOKENS,
    model: str | None = None,
) -> LegalRagResult:
    """Generate outside the database connection, with safe 503 fallback.

    The caller must finish retrieval and close its connection first.
    Unreviewed documents are blocked unless explicitly enabled for tests.
    """
    if not question.strip():
        raise ValueError("Pergunta juridica vazia.")

    if not prepared.documents or not prepared.context.strip():
        raise ValueError("Evidencias preparadas ausentes.")

    expected_ids = tuple(f"F{index}" for index in range(1, len(prepared.documents) + 1))

    if prepared.citation_ids != expected_ids:
        raise ValueError("Identificadores de evidencias invalidos.")

    if not allow_pending_review and any(
        document.metadata.get("review_status") != "reviewed" for document in prepared.documents
    ):
        raise ValueError("Documentos juridicos ainda nao revisados.")

    if generator is None:
        generator = generate_legal_answer_from_settings

    try:
        extra_kwargs = {"model": model} if model is not None else {}
        answer = generator(
            question=question,
            context=prepared.context,
            allow_pending_review=allow_pending_review,
            system_instruction=system_instruction,
            max_output_tokens=max_output_tokens,
            **extra_kwargs,
        )
    except Exception as error:
        if not _is_http_503(error):
            raise

        return LegalRagResult(
            status="llm_unavailable",
            answer=None,
            documents=prepared.documents,
            citation_ids=prepared.citation_ids,
        )

    if not isinstance(answer, LegalAnswer):
        raise ValueError("Gerador retornou resultado inesperado.")

    if not answer.text.strip() or not answer.citations:
        raise ValueError("Resposta gerada sem texto ou citacoes.")

    if not set(answer.citations).issubset(expected_ids):
        raise ValueError("Resposta possui citacoes desconhecidas.")

    if answer.evidence_count != len(prepared.documents):
        raise ValueError("Quantidade de evidencias inconsistente.")

    return LegalRagResult(
        status="generated",
        answer=answer,
        documents=prepared.documents,
        citation_ids=prepared.citation_ids,
    )
