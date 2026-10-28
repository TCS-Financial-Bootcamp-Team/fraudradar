"""Dependências das rotas: conexão com o banco e usuário autenticado."""

from collections.abc import Iterator
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import Connection

from fraudradar.banco import get_engine
from fraudradar.config import get_settings


def _conexao() -> Iterator[Connection]:
    # Uma transação por requisição: commit no fim da rota, rollback se ela levantar.
    with get_engine().begin() as conn:
        conn.exec_driver_sql("SET LOCAL statement_timeout = '15s'")
        yield conn


# scope="function": o commit roda antes de a resposta sair, então falha no commit vira 500.
Conexao = Annotated[Connection, Depends(_conexao, scope="function")]


@dataclass(frozen=True)
class Usuario:
    id: str
    nome: str  # nome do perfil (user_metadata.nome); o e-mail quando o perfil não tem nome


USUARIO_LOCAL = Usuario(id="local", nome="Analista local")

_bearer = HTTPBearer(auto_error=False)


def _nao_autenticado(detalhe: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detalhe, headers={"WWW-Authenticate": "Bearer"}
    )


@lru_cache
def _jwks(url_supabase: str) -> jwt.PyJWKClient:
    # O conjunto de chaves fica em cache por 10 min: uma chave revogada no Supabase deixa de
    # autenticar quando ele vence. Nada de cache por chave, que não expira.
    return jwt.PyJWKClient(f"{url_supabase}/auth/v1/.well-known/jwks.json", lifespan=600, timeout=5)


def usuario_atual(
    credenciais: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Usuario:
    """Valida o access token do Supabase Auth pela chave pública (JWKS) do projeto."""
    s = get_settings()
    if s.auth_desligada:
        return USUARIO_LOCAL
    if not s.supabase_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Autenticação não configurada na API (defina SUPABASE_URL).",
        )
    if credenciais is None:
        raise _nao_autenticado("Sessão ausente. Entre novamente.")
    url = s.supabase_url.rstrip("/")
    token = credenciais.credentials
    try:
        # O kid é procurado só no conjunto em cache (renovado a cada 10 min). Forçar nova busca
        # para kid desconhecido deixaria qualquer um disparar uma requisição ao Supabase por
        # token inventado, sem limite quando ele está fora do ar. Chave nova do Supabase entra
        # no JWKS como reserva antes de assinar, então chega ao cache a tempo.
        kid = jwt.get_unverified_header(token).get("kid")
        chave = _jwks(url).get_jwk_set()[kid].key
        # Só algoritmos assimétricos: HS256 com a chave pública seria falsificável.
        claims = jwt.decode(
            token,
            chave,
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
        raise _nao_autenticado("Sessão inválida ou expirada. Entre novamente.") from exc
    # Login anônimo do Supabase também recebe role "authenticated": não é analista.
    if claims.get("role") != "authenticated" or claims.get("is_anonymous") is True:
        raise _nao_autenticado("Sessão sem acesso de analista.")
    perfil = claims.get("user_metadata")
    nome = str(perfil.get("nome") or "").strip() if isinstance(perfil, dict) else ""
    nome = nome or str(claims.get("email") or "").strip() or str(claims["sub"])
    return Usuario(id=str(claims["sub"]), nome=nome)


# Quem decide e aprova: o nome vai para decisoes.analista, comunicacoes.aprovado_por e auditoria.
UsuarioAtual = Annotated[Usuario, Depends(usuario_atual)]
