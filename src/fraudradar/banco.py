"""Conexão com o Postgres, compartilhada por API, worker e notebooks."""

from functools import lru_cache

from sqlalchemy import Engine, create_engine, text

from fraudradar.config import get_settings


@lru_cache
def get_engine() -> Engine:
    s = get_settings()
    return create_engine(
        s.database_url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": s.db_connect_timeout},
    )


def checar_conexao() -> tuple[bool, str]:
    """Executa `SELECT 1`. Nunca levanta exceção: devolve (ok, detalhe)."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:  # noqa: BLE001 - qualquer falha vira "banco fora"
        return False, type(exc).__name__
