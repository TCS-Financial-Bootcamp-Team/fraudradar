"""Parecer e assistente (LLM com RAG). A cadeia vai viver em fraudradar.ai (frente 3).

Enquanto ela não existe, as rotas validam o pedido, conferem o alerta e respondem 503.
O LLM nunca recebe números de conta: pseudonimize antes do prompt.
"""

from fastapi import APIRouter, status

from api.dependencies import DbConnection
from api.domain import AlertId, get_alert_row
from api.errors import AppError
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
    """Pergunta geral do analista ao agente (fora de um alerta)."""
    raise _unavailable()
