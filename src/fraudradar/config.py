"""Configuração lida do ambiente e do arquivo `.env` na raiz do repositório."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar"
    db_connect_timeout: int = 3

    llm_provider: Literal["openai", "anthropic"] = "openai"
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    llm_model: str | None = None
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_dim: int = 384

    model_dir: Path = ROOT_DIR / "models"
    model_file: str = "lightgbm_model.txt"
    data_dir: Path = ROOT_DIR / "data"

    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # A API valida o JWT do Supabase Auth, o mesmo projeto do front (aceita a variável do front).
    supabase_url: str | None = Field(
        default=None, validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL")
    )
    # Só para desenvolvimento e testes: aceita qualquer requisição como "Analista local".
    auth_disabled: bool = False

    # POST /ingestion/csv: um envio no limite cabe com folga no statement_timeout de 15 s
    # (200 mil linhas: COPY de ~1,9 s com 11 mi de linhas na tabela). O SAML-D inteiro é do
    # worker, não da API.
    ingestion_max_bytes: int = 20 * 1024 * 1024
    ingestion_max_rows: int = 200_000

    @field_validator("model_dir", "data_dir")
    @classmethod
    def _relative_to_root(cls, path: Path) -> Path:
        # Caminho relativo no .env vale a partir da raiz do repo, não do cwd (notebooks/).
        return path if path.is_absolute() else ROOT_DIR / path

    @property
    def model_path(self) -> Path:
        return self.model_dir / self.model_file

    @property
    def llm_key_configured(self) -> bool:
        key = self.openai_api_key if self.llm_provider == "openai" else self.anthropic_api_key
        return bool(key and key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
