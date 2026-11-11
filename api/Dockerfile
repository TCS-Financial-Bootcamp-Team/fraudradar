# Contexto de build: raiz do repositório.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --group api

COPY src ./src
COPY api ./api
COPY worker ./worker
# DDL das tabelas de dados: create_dataset aplica no schema de cada conjunto novo.
COPY db/init/002_tables.sql ./db/init/002_tables.sql
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups --group api

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
