"""Parecer e assistente (LLM com RAG). A cadeia vive em fraudradar.ai (frente 3).

`POST /chat` responde perguntas jurídicas gerais com o RAG das fontes revisadas
(`api/legal_chat_service.py`). O parecer e o chat de um alerta ainda respondem 503.
O LLM nunca recebe números de conta: pseudonimize antes do prompt.
"""

import re

from fastapi import APIRouter, status
from google.genai import errors as genai_errors

from api.dependencies import DbConnection
from api.domain import AlertId, get_alert_row
from api.errors import AppError
from api.legal_chat_service import (
    LegalEvidenceUnavailableError,
    answer_legal_chat,
)
from api.schemas.alerts import Assessment
from api.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(tags=["ai"])

AI_UNAVAILABLE = "O assistente de IA ainda não está disponível nesta versão da API."
_RESPONSES = {503: {"description": AI_UNAVAILABLE}}


def _unavailable() -> AppError:
    return AppError(status.HTTP_503_SERVICE_UNAVAILABLE, "ai.unavailable", AI_UNAVAILABLE)


@router.post("/alerts/{alert_id}/assessment", response_model=Assessment, responses=_RESPONSES)
def generate_assessment(alert_id: AlertId, conn: DbConnection) -> Assessment:
    """Gera o parecer do alerta com RAG e grava em `assessments`."""
    get_alert_row(conn, alert_id)
    raise _unavailable()


@router.post("/alerts/{alert_id}/chat", response_model=ChatResponse, responses=_RESPONSES)
def chat_about_alert(alert_id: AlertId, request: ChatRequest, conn: DbConnection) -> ChatResponse:
    """Pergunta do analista ao agente, com o alerta como contexto."""
    get_alert_row(conn, alert_id)
    raise _unavailable()


@router.post("/chat", response_model=ChatResponse, responses=_RESPONSES)
def chat(request: ChatRequest) -> ChatResponse:
    """Responde perguntas jurídicas gerais com as evidências revisadas do RAG."""
    if request.context.alert_id is not None:
        raise AppError(
            status.HTTP_400_BAD_REQUEST,
            "ai.chat_alert_route",
            "Use a rota de chat do alerta para perguntas sobre alertas.",
        )

    # Defesa em profundidade: o front já pseudonimiza as mensagens.
    # A checagem é conservadora, não um detector completo de dados pessoais.
    if re.search(
        r"\d{5,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
        request.message,
    ):
        raise AppError(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "ai.chat_personal_data",
            "Remova identificadores pessoais ou financeiros da pergunta.",
        )

    # Só a pergunta atual vai ao LLM, de propósito: histórico, página e semana ficam de fora.
    try:
        return answer_legal_chat(request.message)
    except LegalEvidenceUnavailableError as error:
        raise AppError(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "ai.no_legal_sources",
            "Nenhuma fonte juridica revisada esta disponivel.",
        ) from error
    except genai_errors.APIError as error:
        if error.code == 429:
            raise AppError(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "ai.provider_rate_limited",
                "Limite temporario do provedor de IA atingido.",
            ) from error

        if error.code == 503:
            raise AppError(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "ai.provider_unavailable",
                "O provedor de IA esta temporariamente indisponivel.",
            ) from error

        raise AppError(
            status.HTTP_502_BAD_GATEWAY,
            "ai.provider_failed",
            "Nao foi possivel obter uma resposta do provedor de IA.",
        ) from error
