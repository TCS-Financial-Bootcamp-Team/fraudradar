"""Validação dos nomes que podem entrar em SQL ao criar conjuntos."""

import pytest

from fraudradar.datasets import (
    InvalidDatasetSlugError,
    InvalidSchemaNameError,
    quote_identifier,
    schema_name_for_slug,
    validate_slug,
)


@pytest.mark.parametrize(
    "slug",
    ["", "UPPER", "com_underscore", "com espaço", "x;drop-schema", "../public", "a" * 41],
)
def test_invalid_slugs_and_injection_attempts_are_rejected(slug):
    with pytest.raises(InvalidDatasetSlugError):
        validate_slug(slug)


def test_schema_is_derived_and_quoted_only_after_validation():
    assert schema_name_for_slug("base-2026") == "ds_base_2026"
    assert quote_identifier("ds_base_2026") == '"ds_base_2026"'
    with pytest.raises(InvalidSchemaNameError):
        quote_identifier('ds_ok"; DROP SCHEMA public; --')
