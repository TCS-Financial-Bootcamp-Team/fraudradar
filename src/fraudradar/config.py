"""Configuração lida do ambiente e do arquivo `.env` na raiz do repositório."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=RAIZ / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar"
    db_connect_timeout: int = 3

    llm_provider: Literal["openai", "anthropic"] = "openai"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    llm_model: str | None = None
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_dim: int = 384

    model_dir: Path = RAIZ / "models"
    model_file: str = "modelo_lightgbm.txt"
    dados_dir: Path = RAIZ / "dados"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    @field_validator("model_dir", "dados_dir")
    @classmethod
    def _relativo_a_raiz(cls, caminho: Path) -> Path:
        # Caminho relativo no .env vale a partir da raiz do repo, não do cwd (notebooks/).
        return caminho if caminho.is_absolute() else RAIZ / caminho

    @property
    def caminho_modelo(self) -> Path:
        return self.model_dir / self.model_file

    @property
    def chave_llm_configurada(self) -> bool:
        chave = self.openai_api_key if self.llm_provider == "openai" else self.anthropic_api_key
        return bool(chave and chave.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
