"""Conjuntos de dados isolados por schema do Postgres.

O slug é a única entrada pública. O nome do schema é derivado dele, validado como
identificador e citado antes de entrar em SQL. As tabelas de domínio vêm do mesmo DDL usado
por ``public``; assim API e worker continuam usando consultas sem schema qualificado.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from sqlalchemy import Connection, RowMapping, text

from fraudradar.config import ROOT_DIR

SLUG_PATTERN = re.compile(r"^[a-z0-9-]{1,40}$")
SCHEMA_PATTERN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class InvalidDatasetSlugError(ValueError):
    """O slug não atende ao contrato público dos conjuntos de dados."""


class InvalidSchemaNameError(ValueError):
    """O schema registrado não é um identificador seguro do Postgres."""


class DatasetNotFoundError(LookupError):
    """O slug não existe no registro global de conjuntos de dados."""


class DatasetAlreadyExistsError(ValueError):
    """O slug já está registrado e não pode ser recriado."""


@dataclass(frozen=True)
class Dataset:
    slug: str
    name: str
    schema_name: str
    origin: str
    active_model_version: str | None
    created_at: datetime


def validate_slug(slug: str) -> str:
    """Valida e devolve um slug sem normalização silenciosa."""
    if not SLUG_PATTERN.fullmatch(slug):
        raise InvalidDatasetSlugError(
            "O slug deve ter de 1 a 40 caracteres: letras minúsculas, números ou hífen."
        )
    return slug


def schema_name_for_slug(slug: str) -> str:
    """Deriva o schema de um slug já validado."""
    return validate_schema_name(f"ds_{validate_slug(slug).replace('-', '_')}")


def validate_schema_name(schema_name: str) -> str:
    """Recusa qualquer valor que não seja um identificador simples e seguro."""
    if not SCHEMA_PATTERN.fullmatch(schema_name):
        raise InvalidSchemaNameError("O schema registrado para o conjunto é inválido.")
    return schema_name


def quote_identifier(identifier: str) -> str:
    """Cita um identificador estritamente validado; nunca aceita texto SQL livre."""
    validate_schema_name(identifier)
    return f'"{identifier}"'


def _dataset_from_row(row: RowMapping) -> Dataset:
    return Dataset(
        slug=row["slug"],
        name=row["name"],
        schema_name=row["schema_name"],
        origin=row["origin"],
        active_model_version=row["active_model_version"],
        created_at=row["created_at"],
    )


def resolve_dataset(conn: Connection, slug: str) -> Dataset:
    """Resolve um slug no registro global; a camada HTTP traduz a ausência para 404."""
    validate_slug(slug)
    row = (
        conn.execute(
            text(
                "SELECT slug, name, schema_name, origin, active_model_version, created_at "
                "FROM public.datasets WHERE slug = :slug"
            ),
            {"slug": slug},
        )
        .mappings()
        .first()
    )
    if row is None:
        raise DatasetNotFoundError(slug)
    validate_schema_name(row["schema_name"])
    return _dataset_from_row(row)


def use_dataset(conn: Connection, dataset: Dataset) -> None:
    """Aplica o schema do conjunto somente à transação atual."""
    schema = quote_identifier(dataset.schema_name)
    conn.exec_driver_sql(f'SET LOCAL search_path TO {schema}, "public"')


@lru_cache
def _data_ddl() -> str:
    return (ROOT_DIR / "db" / "init" / "002_tables.sql").read_text(encoding="utf-8")


def create_dataset(conn: Connection, *, name: str, slug: str) -> Dataset:
    """Cria schema, tabelas e registro na transação já aberta pelo chamador."""
    slug = validate_slug(slug)
    clean_name = name.strip()
    if not clean_name:
        raise ValueError("O nome do conjunto de dados não pode ficar vazio.")
    schema_name = schema_name_for_slug(slug)
    conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"fraudradar.dataset.{slug}"},
    )
    exists = conn.execute(
        text("SELECT 1 FROM public.datasets WHERE slug = :slug"), {"slug": slug}
    ).scalar_one_or_none()
    if exists is not None:
        raise DatasetAlreadyExistsError(slug)
    quoted_schema = quote_identifier(schema_name)
    conn.exec_driver_sql(f"CREATE SCHEMA {quoted_schema}")
    conn.exec_driver_sql(f'SET LOCAL search_path TO {quoted_schema}, "public"')
    conn.exec_driver_sql(_data_ddl())
    row = (
        conn.execute(
            text(
                "INSERT INTO public.datasets (slug, name, schema_name, origin) "
                "VALUES (:slug, :name, :schema_name, 'external') "
                "RETURNING slug, name, schema_name, origin, active_model_version, created_at"
            ),
            {"slug": slug, "name": clean_name, "schema_name": schema_name},
        )
        .mappings()
        .one()
    )
    return _dataset_from_row(row)
