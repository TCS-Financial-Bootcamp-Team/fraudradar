from fastapi import APIRouter

from api.schemas.health import DatabaseStatus, Health, LlmStatus, ModelStatus
from fraudradar.config import get_settings
from fraudradar.db import check_connection

router = APIRouter(tags=["health"])


@router.get("/health", response_model=Health)
def get_health() -> Health:
    """Estado do banco (SELECT 1), do arquivo do modelo e da chave do LLM (sem chamar o LLM)."""
    s = get_settings()
    db_ok, detail = check_connection()
    model_ok = s.model_path.is_file()
    llm_ok = s.llm_key_configured
    return Health(
        status="ok" if db_ok and model_ok and llm_ok else "degraded",
        database=DatabaseStatus(ok=db_ok, detail=detail),
        model=ModelStatus(ok=model_ok, file=s.model_file),
        llm=LlmStatus(ok=llm_ok, provider=s.llm_provider),
    )
