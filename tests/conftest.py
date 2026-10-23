import pytest

from fraudradar.banco import get_engine
from fraudradar.config import get_settings

# Porta 1 em localhost: recusa conexão na hora, sem depender de Docker.
BANCO_FORA = "postgresql+psycopg://x:x@127.0.0.1:1/x"


@pytest.fixture(autouse=True)
def ambiente_isolado(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", BANCO_FORA)
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "1")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()
