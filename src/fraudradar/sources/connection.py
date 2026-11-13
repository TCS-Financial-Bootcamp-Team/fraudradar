"""Acesso somente leitura a um Postgres externo.

Regras (docs/external-data.md): host na lista ``EXTERNAL_DB_ALLOWED_HOSTS`` (vazia = recusa),
transação ``READ ONLY``, ``connect_timeout`` e ``statement_timeout`` curtos, lista fixa de
colunas do SAML-D e tabela validada como identificador (``[schema.]tabela``) e citada. Nenhum
SQL vem do usuário, e a senha nunca aparece em mensagem de erro nem em log.
"""

import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

import psycopg
from psycopg import sql

from fraudradar.config import get_settings
from fraudradar.data.schema import GROUND_TRUTH_COLUMNS, TRANSACTION_COLUMNS
from fraudradar.messages import Msg, msg

# Colunas lidas da fonte, na ordem do SAML-D. As duas últimas são opcionais (gabarito).
SOURCE_COLUMNS: list[str] = [*TRANSACTION_COLUMNS, *GROUND_TRUTH_COLUMNS]

CONNECT_TIMEOUT_SECONDS = 5
TEST_STATEMENT_TIMEOUT_MS = 10_000
# Leitura de lotes (importação e acompanhamento): a ordenação de uma tabela grande pode demorar.
READ_STATEMENT_TIMEOUT_MS = 300_000

_IDENTIFIER_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,62}")
_HOST_RE = re.compile(r"[A-Za-z0-9]([A-Za-z0-9.\-]{0,251}[A-Za-z0-9])?|\[?[0-9A-Fa-f:]{2,45}\]?")


# Rótulo do que está sendo validado -> chave estável (as telas traduzem o rótulo).
_IDENTIFIER_KINDS = {
    "schema": "schema",
    "nome da tabela": "table",
    "nome da coluna de controle": "control_column",
}


class SourceError(Exception):
    """Falha ao usar a fonte externa; a mensagem já é para o analista, em PT-BR.

    ``code`` e ``params`` deixam o front traduzir (veja ``fraudradar.messages``)."""

    def __init__(
        self, message: str, code: str = "source.error", params: dict | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.params: dict = dict(params or {})

    @classmethod
    def from_msg(cls, message: Msg) -> "SourceError":
        return cls(message.text, message.code, dict(message.params))


class HostNotAllowedError(SourceError):
    """O host não está em EXTERNAL_DB_ALLOWED_HOSTS."""


class InvalidIdentifierError(SourceError):
    """Nome de tabela ou coluna que não é um identificador simples."""


@dataclass(frozen=True)
class ExternalSource:
    """Dados de acesso a uma tabela externa. ``repr`` esconde a senha."""

    host: str
    port: int
    database: str
    user: str
    password: str = field(repr=False)
    table: str
    control_column: str | None = None


def validate_identifier(value: str, what: str = "nome") -> str:
    if not isinstance(value, str) or not _IDENTIFIER_RE.fullmatch(value):
        raise InvalidIdentifierError(
            f"O {what} deve ser um identificador simples: letras, números e _, "
            "começando por letra ou _, com até 63 caracteres.",
            "source.identifier",
            {"what": _IDENTIFIER_KINDS.get(what, "name")},
        )
    return value


def split_relation(table: str) -> tuple[str | None, str]:
    """``[schema.]tabela`` -> (schema ou None, tabela), cada parte validada."""
    parts = table.strip().split(".")
    if len(parts) > 2:
        raise InvalidIdentifierError(
            "Use a tabela como tabela ou schema.tabela.", "source.table_format"
        )
    if len(parts) == 2:
        return validate_identifier(parts[0], "schema"), validate_identifier(
            parts[1], "nome da tabela"
        )
    return None, validate_identifier(parts[0], "nome da tabela")


def relation_identifier(table: str) -> sql.Identifier:
    schema, name = split_relation(table)
    return sql.Identifier(schema, name) if schema else sql.Identifier(name)


def check_host(host: str) -> str:
    """Devolve o host normalizado se estiver liberado; vazio na lista = recusa tudo."""
    clean = host.strip().lower()
    if not clean or not _HOST_RE.fullmatch(clean):
        raise HostNotAllowedError(
            "Host inválido: informe só o nome ou o IP do servidor.", "source.host_invalid"
        )
    allowed = [h.strip().lower() for h in get_settings().external_db_allowed_hosts]
    if clean not in allowed:
        raise HostNotAllowedError(
            "Este host não está liberado para conexões externas. "
            "Peça a quem administra o sistema para incluí-lo em EXTERNAL_DB_ALLOWED_HOSTS.",
            "source.host_not_allowed",
        )
    return clean


def check_port(port: int) -> int:
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise SourceError("A porta deve estar entre 1 e 65535.", "source.port")
    return port


def describe_error_message(exc: Exception, source: ExternalSource) -> Msg:
    """Mensagem curta e segura para a tela: sem senha, sem detalhes internos do driver."""
    if isinstance(exc, SourceError):
        return msg(exc.code, str(exc), **exc.params)
    if isinstance(exc, psycopg.errors.QueryCanceled):
        return msg(
            "source.timeout", "A consulta demorou demais e foi cancelada pelo limite de tempo."
        )
    if isinstance(
        exc, psycopg.errors.InvalidPassword | psycopg.errors.InvalidAuthorizationSpecification
    ):
        return msg("source.auth_refused", "Usuário ou senha recusados pelo servidor.")
    if isinstance(exc, psycopg.errors.UndefinedTable):
        return msg("source.table_missing", "A tabela de origem não existe nesse banco.")
    if isinstance(exc, psycopg.errors.InsufficientPrivilege):
        return msg("source.no_permission", "O usuário não tem permissão de leitura nessa tabela.")
    if isinstance(exc, psycopg.OperationalError):
        detail = " ".join(str(exc).split())
        if source.password:  # ``"".replace("", "***")`` enfiaria *** entre todas as letras
            detail = detail.replace(source.password, "***")
        detail = detail[:200]
        if "password authentication failed" in detail:
            return msg("source.auth_refused", "Usuário ou senha recusados pelo servidor.")
        if "does not exist" in detail and "database" in detail:
            return msg("source.database_missing", "O banco informado não existe nesse servidor.")
        return msg(
            "source.cannot_connect",
            "Não foi possível conectar ao servidor. Confira host, porta e rede.",
        )
    return msg("source.read_failed", "Falha ao ler a fonte externa.")


def describe_error(exc: Exception, source: ExternalSource) -> str:
    """O texto de ``describe_error_message`` (em português)."""
    return describe_error_message(exc, source).text


@contextmanager
def open_readonly(
    source: ExternalSource, *, statement_timeout_ms: int = TEST_STATEMENT_TIMEOUT_MS
) -> Iterator[psycopg.Connection]:
    """Conexão do psycopg em transação ``READ ONLY`` (nada é gravado na fonte)."""
    host = check_host(source.host)
    check_port(source.port)
    try:
        conn = psycopg.connect(
            host=host,
            port=source.port,
            dbname=source.database,
            user=source.user,
            password=source.password,
            connect_timeout=CONNECT_TIMEOUT_SECONDS,
            options=f"-c statement_timeout={int(statement_timeout_ms)}",
            application_name="fraudradar-import",
        )
    except psycopg.Error as exc:
        raise SourceError.from_msg(describe_error_message(exc, source)) from None
    try:
        conn.read_only = True
        yield conn
    except psycopg.Error as exc:
        raise SourceError.from_msg(describe_error_message(exc, source)) from None
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()
