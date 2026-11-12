"""As imagens da API e do worker levam o DDL que cria as tabelas de um conjunto novo.

create_dataset (src/fraudradar/datasets.py) lê db/init/002_tables.sql em tempo de execução; sem
o arquivo na imagem, importar um banco externo como conjunto novo dava 500 só no Docker.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("dockerfile", ["api/Dockerfile", "worker/Dockerfile"])
def test_image_copies_the_data_ddl(dockerfile):
    content = (ROOT / dockerfile).read_text(encoding="utf-8")
    assert "COPY db/init/002_tables.sql ./db/init/002_tables.sql" in content


def test_dockerignore_does_not_exclude_the_ddl():
    ignored = (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines()
    assert not any(line.strip().rstrip("/") in {"db", "db/init"} for line in ignored)
