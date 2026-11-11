"""Parecer e assistente (LLM com RAG). A cadeia vai viver em fraudradar.ai (frente 3).

Enquanto ela não existe, as rotas validam o pedido, conferem o alerta e respondem 503.
O LLM nunca recebe números de conta: pseudonimize antes do prompt.
"""

import re

from fastapi import APIRouter, HTTPException, status
from google.genai import errors

from api.dependencies import DbConnection
from api.domain import AlertId, get_alert_row
from api.legal_chat_service import (
    LegalEvidenceUnavailableError,
    answer_legal_chat,
)
from api.schemas.alerts import Assessment
from api.schemas.chat import ChatRequest, ChatResponse

router = APIRouter(tags=["ai"])

AI_UNAVAILABLE = "O assistente de IA ainda não está disponível nesta versão da API."
_RESPONSES = {503: {"description": AI_UNAVAILABLE}}


def _unavailable() -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, AI_UNAVAILABLE)


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
    """Respond to general legal questions using reviewed RAG evidence."""
    if request.context.alert_id is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Use a rota de chat do alerta para perguntas sobre alertas.",
        )

    # Defense in depth: the frontend already pseudonymizes messages.
    # This check is conservative, not a complete PII detector.
    if re.search(
        r"\d{5,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}",
        request.message,
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Remova identificadores pessoais ou financeiros da pergunta.",
        )

    # Deliberately send only the current question.
    # History, page and week are not forwarded to the LLM.
    try:
        return answer_legal_chat(request.message)
    except LegalEvidenceUnavailableError as error:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Nenhuma fonte juridica revisada esta disponivel.",
        ) from error
    except errors.APIError as error:
        if error.code == 429:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Limite temporario do provedor de IA atingido.",
            ) from error

        if error.code == 503:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "O provedor de IA esta temporariamente indisponivel.",
            ) from error

        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Nao foi possivel obter uma resposta do provedor de IA.",
        ) from error
