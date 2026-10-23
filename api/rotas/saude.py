from fastapi import APIRouter

from api.schemas.saude import Saude, StatusBanco, StatusLlm, StatusModelo
from fraudradar.banco import checar_conexao
from fraudradar.config import get_settings

router = APIRouter(tags=["saude"])


@router.get("/saude", response_model=Saude)
def saude() -> Saude:
    """Estado do banco (SELECT 1), do arquivo do modelo e da chave do LLM (sem chamar o LLM)."""
    s = get_settings()
    banco_ok, detalhe = checar_conexao()
    modelo_ok = s.caminho_modelo.is_file()
    llm_ok = s.chave_llm_configurada
    return Saude(
        status="ok" if banco_ok and modelo_ok and llm_ok else "degradado",
        banco=StatusBanco(ok=banco_ok, detalhe=detalhe),
        modelo=StatusModelo(ok=modelo_ok, arquivo=s.model_file),
        llm=StatusLlm(ok=llm_ok, provedor=s.llm_provider),
    )
