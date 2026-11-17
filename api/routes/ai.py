"""Legal chat and contextual alert AI endpoints.

The assessment endpoint:
1. Reads and pseudonymizes financial evidence.
2. Closes its database transaction.
3. Invokes the reviewed legal RAG and LLM.
4. Validates citations.
5. Persists the draft in a separate transaction.

A generated assessment never makes an analyst decision.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Header, status
from google.genai import errors as genai_errors

from api.alert_ai_service import (
    generate_alert_assessment,
    prepare_alert_ai,
)
from api.domain import AlertId, get_alert_row
from api.errors import AppError
from api.legal_chat_service import (
    LegalEvidenceUnavailableError,
    answer_legal_chat,
)
from api.repositories.alert_assessments import (
    save_generated_assessment,
)
from api.schemas.alerts import Assessment
from api.schemas.chat import ChatRequest, ChatResponse

from fraudradar.config import get_settings
from fraudradar.datasets import (
    DatasetNotFoundError,
    InvalidDatasetSlugError,
    resolve_dataset,
    use_dataset,
)
from fraudradar.db import get_engine


router = APIRouter(tags=["ai"])

AI_UNAVAILABLE = (
    "O assistente de IA ainda nao esta disponivel "
    "nesta versao da API."
)

_RESPONSES = {
    503: {
        "description": "Servico de IA temporariamente indisponivel."
    }
}

DatasetHeader = Annotated[
    str,
    Header(alias="X-Dataset"),
]


def _unavailable() -> AppError:
    return AppError(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "ai.unavailable",
        AI_UNAVAILABLE,
    )


def _set_dataset(conn, slug: str) -> None:
    """Apply the same dataset isolation used by regular API routes."""

    try:
        dataset = resolve_dataset(conn, slug)
    except (
        DatasetNotFoundError,
        InvalidDatasetSlugError,
    ) as error:
        raise AppError(
            status.HTTP_404_NOT_FOUND,
            "dataset.not_found",
            "Conjunto de dados nao encontrado.",
            {"slug": slug},
        ) from error

    use_dataset(conn, dataset)


def _set_timeout(conn) -> None:
    conn.exec_driver_sql(
        "SET LOCAL statement_timeout = '15s'"
    )


def _translate_ai_error(error: Exception) -> AppError:
    """Translate provider errors without exposing internal details."""

    if isinstance(
        error,
        LegalEvidenceUnavailableError,
    ):
        return AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.no_legal_sources",
            "Nenhuma fonte juridica revisada esta disponivel.",
        )

    if isinstance(error, genai_errors.APIError):
        if error.code == 429:
            return AppError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "ai.provider_rate_limited",
                "Limite temporario do provedor de IA atingido.",
            )

        if error.code == 503:
            return AppError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "ai.provider_unavailable",
                "O provedor de IA esta temporariamente indisponivel.",
            )

        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Nao foi possivel obter uma resposta do provedor de IA.",
        )

    if isinstance(error, ValueError):
        if (
            "Mensagem de indisponibilidade"
            in str(error)
        ):
            return AppError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "ai.provider_unavailable",
                "O provedor de IA esta temporariamente indisponivel.",
            )

        return AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.invalid_assessment",
            "O parecer gerado nao passou na validacao.",
        )

    return AppError(
        status.HTTP_502_BAD_GATEWAY,
        "ai.generation_failed",
        "Nao foi possivel gerar o parecer.",
    )


@router.post(
    "/alerts/{alert_id}/assessment",
    response_model=Assessment,
    responses=_RESPONSES,
)
def generate_assessment(
    alert_id: AlertId,
    x_dataset: DatasetHeader = "saml-d",
) -> Assessment:
    """Generate, validate and persist an assisted assessment."""

    engine = get_engine()

    # --------------------------------------------------------
    # 1. FINANCIAL EVIDENCE: SHORT READ TRANSACTION
    # --------------------------------------------------------

    with engine.begin() as conn:
        _set_timeout(conn)
        _set_dataset(conn, x_dataset)

        prepared = prepare_alert_ai(
            conn,
            alert_id,
        )

    # The read transaction is already closed here.

    # --------------------------------------------------------
    # 2. GEMINI + REVIEWED LEGAL RAG
    # --------------------------------------------------------

    model = get_settings().llm_model

    if not model:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.model_not_configured",
            "Modelo de IA nao configurado.",
        )

    try:
        assessment = generate_alert_assessment(
            prepared,
        )

    except (
        LegalEvidenceUnavailableError,
        genai_errors.APIError,
        ValueError,
    ) as error:
        raise _translate_ai_error(error) from error

    # --------------------------------------------------------
    # 3. VALIDATE BEFORE OPENING WRITE TRANSACTION
    # --------------------------------------------------------

    from api.repositories.alert_assessments import (
        validate_generated_assessment,
    )

    try:
        validate_generated_assessment(
            assessment,
        )
    except ValueError as error:
        raise _translate_ai_error(error) from error

    # --------------------------------------------------------
    # 4. SHORT WRITE TRANSACTION
    # --------------------------------------------------------

    with engine.begin() as conn:
        _set_timeout(conn)
        _set_dataset(conn, x_dataset)

        # The alert may have been removed during generation.
        get_alert_row(conn, alert_id)

        save_generated_assessment(
            conn,
            alert_id=alert_id,
            assessment=assessment,
            model=model,
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
    """Answer an alert question using protected financial facts and legal RAG."""

    # Prevent a request from silently referring to a different alert.
    if (
        request.context.alert_id is not None
        and request.context.alert_id != str(alert_id)
    ):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.alert_context_mismatch",
            "O alerta informado nao corresponde ao alerta selecionado.",
        )

    engine = get_engine()

    # 1. Retrieve financial evidence in a short transaction.
    with engine.begin() as conn:
        _set_timeout(conn)
        _set_dataset(conn, x_dataset)

        prepared = prepare_alert_ai(
            conn,
            alert_id,
        )

    # 2. The database transaction is closed before the LLM call.
    from api.alert_ai_service import answer_alert_question

    try:
        response = answer_alert_question(
            prepared,
            request.message,
        )
    except (
        LegalEvidenceUnavailableError,
        genai_errors.APIError,
        ValueError,
    ) as error:
        raise _translate_ai_error(error) from error

    return response


@router.post(
    "/chat",
    response_model=ChatResponse,
    responses=_RESPONSES,
)
def chat(
    request: ChatRequest,
) -> ChatResponse:
    """General legal chat with reviewed RAG sources."""

    if request.context.alert_id is not None:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "ai.chat_alert_route",
            "Use a rota de chat do alerta para perguntas sobre alertas.",
        )

    if re.search(
        r"\d{5,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
        request.message,
    ):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.chat_personal_data",
            "Remova identificadores pessoais ou financeiros da pergunta.",
        )

    try:
        return answer_legal_chat(
            request.message,
        )

    except (
        LegalEvidenceUnavailableError,
        genai_errors.APIError,
    ) as error:
        raise _translate_ai_error(error) from error


# Keep the existing dataset-scoped dependency for the
# contextual chat stub until that route is implemented.
from api.dependencies import DbConnection