import pytest

from fraudradar.config import get_settings
from fraudradar.db import get_engine

# Porta 1 em localhost: recusa conexão na hora, sem depender de Docker.
UNREACHABLE_DB = "postgresql+psycopg://x:x@127.0.0.1:1/x"


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", UNREACHABLE_DB)
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "1")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    # O .env de dev costuma ter AUTH_DISABLED=true; quem precisa dela liga (fixture `client`).
    monkeypatch.setenv("AUTH_DISABLED", "false")
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()
