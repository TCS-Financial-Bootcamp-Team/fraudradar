"""Rotas do chat jurídico e da assistência contextual de alertas.

As rotas de alerta verificam a configuração, leem evidências em uma transação
curta, fecham o banco durante o RAG e o Gemini e, no parecer, persistem o
rascunho validado em outra transação curta. A IA nunca toma a decisão.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Header, status
from google.genai import errors as genai_errors

from api.alert_ai_service import prepare_alert_ai
from api.dependencies import CurrentUser
from api.domain import AlertId, get_alert_row
from api.errors import AppError
from api.legal_chat_service import LegalEvidenceUnavailableError, answer_legal_chat
from api.repositories.alert_assessments import (
    save_generated_assessment,
    validate_generated_assessment,
)
from api.schemas.alerts import Assessment
from api.schemas.chat import ChatRequest, ChatResponse
from fraudradar.ai.alert_assessment import (
    AlertContextBlockedError,
    AlertQuestionTooLongError,
    build_alert_chat_request,
    build_assessment_request,
    parse_suggested_typology,
)
from fraudradar.ai.legal_chat_adapter import LLM_UNAVAILABLE_ANSWER
from fraudradar.ai.legal_generation import (
    LegalAnswerRejectedError,
    LegalLlmNotConfiguredError,
    gemini_settings,
)
from fraudradar.datasets import (
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)
from fraudradar.db import get_engine

router = APIRouter(tags=["ai"])

_RESPONSES = {503: {"description": "Serviço de IA temporariamente indisponível."}}

DatasetHeader = Annotated[str, Header(alias="X-Dataset")]


def _set_dataset(conn, slug: str) -> None:
    """Aplica o mesmo isolamento por conjunto usado pelas demais rotas."""
    try:
        dataset = resolve_dataset(conn, slug)
    except (DatasetNotFoundError, InvalidDatasetSlugError) as error:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "dataset.not_found",
            "Conjunto de dados não encontrado.",
            {"slug": slug},
        ) from error
    use_dataset(conn, dataset)


def _set_timeout(conn) -> None:
    """Limita cada transação curta a quinze segundos."""
    conn.exec_driver_sql("SET LOCAL statement_timeout = '15s'")


def _translate_ai_error(error: Exception) -> AppError:
    """Traduz falhas comuns às três rotas sem expor detalhes internos."""
    if isinstance(error, LegalLlmNotConfiguredError):
        return AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.not_configured",
            "A IA não está configurada na API (defina LLM_MODEL e a chave do Gemini).",
        )
    if isinstance(error, LegalEvidenceUnavailableError):
        return AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.no_legal_sources",
            "Nenhuma fonte jurídica revisada está disponível.",
        )
    if isinstance(error, LegalAnswerRejectedError):
        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Não foi possível obter uma resposta válida do provedor de IA.",
        )
    if isinstance(error, genai_errors.APIError):
        if error.code == 429:
            return AppError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "ai.provider_rate_limited",
                "O limite temporário do provedor de IA foi atingido.",
            )
        if error.code == 503:
            return _provider_unavailable()
        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Não foi possível obter uma resposta do provedor de IA.",
        )
    raise TypeError(f"Erro de IA sem tradução: {type(error).__name__}")


def _configured_model() -> str:
    """Verifica o Gemini antes de qualquer acesso ao banco e devolve o modelo."""
    try:
        model, _ = gemini_settings()
    except LegalLlmNotConfiguredError as error:
        raise _translate_ai_error(error) from error
    return model


def _context_blocked() -> AppError:
    return AppError(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "ai.context_blocked",
        "O parecer não foi gerado para proteger os dados das contas.",
    )


def _provider_unavailable() -> AppError:
    return AppError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "ai.provider_unavailable",
        "O provedor de IA está temporariamente indisponível.",
    )


def _question_too_long() -> AppError:
    return AppError(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "ai.question_too_long",
        "A pergunta e o resumo do alerta excedem o limite de 2.000 caracteres.",
    )


@router.post(
    "/alerts/{alert_id}/assessment",
    response_model=Assessment,
    responses=_RESPONSES,
)
def generate_assessment(
    alert_id: AlertId,
    user: CurrentUser,
    x_dataset: DatasetHeader = "saml-d",
) -> Assessment:
    """Gera, valida e persiste um rascunho de parecer para revisão humana."""
    model = _configured_model()
    engine = get_engine()

    try:
        with engine.begin() as conn:
            _set_timeout(conn)
            _set_dataset(conn, x_dataset)
            prepared = prepare_alert_ai(conn, alert_id)
        request = build_assessment_request(prepared)
    except AlertQuestionTooLongError as error:
        raise _question_too_long() from error
    except AlertContextBlockedError as error:
        raise _context_blocked() from error

    try:
        generated = answer_legal_chat(
            request.prompt,
            retrieval_query=request.retrieval_query,
        )
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error

    if generated.answer == LLM_UNAVAILABLE_ANSWER:
        raise _provider_unavailable()

    parsed = parse_suggested_typology(generated.answer)
    assessment = Assessment(content=parsed.content, sources=generated.sources)
    try:
        validate_generated_assessment(assessment)
    except ValueError as error:
        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.invalid_assessment",
            "O parecer gerado não passou na validação.",
        ) from error

    with engine.begin() as conn:
        _set_timeout(conn)
        _set_dataset(conn, x_dataset)
        get_alert_row(conn, alert_id)
        save_generated_assessment(
            conn,
            alert_id=alert_id,
            assessment=assessment,
            model=model,
            suggested_typology=parsed.suggested_typology,
            user=user,
        )
    return assessment


@router.post(
    "/alerts/{alert_id}/chat",
    response_model=ChatResponse,
    responses=_RESPONSES,
)
def chat_about_alert(
    alert_id: AlertId,
    request: ChatRequest,
    x_dataset: DatasetHeader = "saml-d",
) -> ChatResponse:
    """Responde sobre um alerta com fatos protegidos e fontes jurídicas revisadas."""
    if request.context.alert_id is not None and request.context.alert_id != str(alert_id):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.alert_context_mismatch",
            "O alerta informado não corresponde ao alerta selecionado.",
        )

    _configured_model()
    engine = get_engine()
    try:
        with engine.begin() as conn:
            _set_timeout(conn)
            _set_dataset(conn, x_dataset)
            prepared = prepare_alert_ai(conn, alert_id)
        legal_request = build_alert_chat_request(prepared, request.message)
    except AlertQuestionTooLongError as error:
        raise _question_too_long() from error
    except AlertContextBlockedError as error:
        raise _context_blocked() from error

    try:
        return answer_legal_chat(
            legal_request.prompt,
            retrieval_query=legal_request.retrieval_query,
        )
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error


@router.post("/chat", response_model=ChatResponse, responses=_RESPONSES)
def chat(request: ChatRequest) -> ChatResponse:
    """Responde perguntas jurídicas gerais com as fontes revisadas do RAG."""
    if request.context.alert_id is not None:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "ai.chat_alert_route",
            "Use a rota de chat do alerta para perguntas sobre alertas.",
        )
    if re.search(r"\d{5,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", request.message):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.chat_personal_data",
            "Remova identificadores pessoais ou financeiros da pergunta.",
        )
    try:
        return answer_legal_chat(request.message)
    except (
        LegalLlmNotConfiguredError,
        LegalEvidenceUnavailableError,
        LegalAnswerRejectedError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error
