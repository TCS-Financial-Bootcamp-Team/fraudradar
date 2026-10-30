"""Dependências das rotas: conexão com o banco e usuário autenticado."""

from collections.abc import Iterator
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Connection

from fraudradar.config import get_settings
from fraudradar.db import get_engine


def _get_connection() -> Iterator[Connection]:
    # Uma transação por requisição: commit no fim da rota, rollback se ela levantar.
    with get_engine().begin() as conn:
        conn.exec_driver_sql("SET LOCAL statement_timeout = '15s'")
        yield conn


# scope="function": o commit roda antes de a resposta sair, então falha no commit vira 500.
DbConnection = Annotated[Connection, Depends(_get_connection, scope="function")]


@dataclass(frozen=True)
class User:
    id: str
    name: str  # nome do perfil (user_metadata.name / nome); o e-mail quando o perfil não tem nome


LOCAL_USER = User(id="local", name="Analista local")

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


@lru_cache
def _jwks(supabase_url: str) -> jwt.PyJWKClient:
    # O conjunto de chaves fica em cache por 10 min: uma chave revogada no Supabase deixa de
    # autenticar quando ele vence. Nada de cache por chave, que não expira.
    return jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json", lifespan=600, timeout=5)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Valida o access token do Supabase Auth pela chave pública (JWKS) do projeto."""
    s = get_settings()
    if s.auth_disabled:
        return LOCAL_USER
    if not s.supabase_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Autenticação não configurada na API (defina SUPABASE_URL).",
        )
    if credentials is None:
        raise _unauthorized("Sessão ausente. Entre novamente.")
    url = s.supabase_url.rstrip("/")
    token = credentials.credentials
    try:
        # O kid é procurado só no conjunto em cache (renovado a cada 10 min). Forçar nova busca
        # para kid desconhecido deixaria qualquer um disparar uma requisição ao Supabase por
        # token inventado, sem limite quando ele está fora do ar. Chave nova do Supabase entra
        # no JWKS como reserva antes de assinar, então chega ao cache a tempo.
        kid = jwt.get_unverified_header(token).get("kid")
        key = _jwks(url).get_jwk_set()[kid].key
        # Só algoritmos assimétricos: HS256 com a chave pública seria falsificável.
        claims = jwt.decode(
            token,
            key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=f"{url}/auth/v1",
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Não foi possível validar a sessão agora."
        ) from exc
    except (jwt.PyJWTError, KeyError) as exc:  # KeyError: kid fora do conjunto
        raise _unauthorized("Sessão inválida ou expirada. Entre novamente.") from exc
    # Login anônimo do Supabase também recebe role "authenticated": não é analista.
    if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
        raise _unauthorized("Sessão sem acesso de analista.")
    profile = claims.get("user_metadata")
    name = (
        str(profile.get("name") or "").strip() or str(profile.get("nome") or "").strip()
        if isinstance(profile, dict)
        else ""
    )
    name = name or str(claims.get("email") or "").strip() or str(claims["sub"])
    return User(id=str(claims["sub"]), name=name)


# Quem decide e aprova: o nome vai para decisions.analyst, reports.approved_by e audit_log.
CurrentUser = Annotated[User, Depends(get_current_user)]
