# Contexto de build: raiz do repositório. Inclui ML e IA (torch CPU).
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/

# lightgbm precisa de libgomp
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-default-groups --group ml --group ia

COPY src ./src
COPY api ./api
COPY worker ./worker
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-default-groups --group ml --group ia

ENTRYPOINT ["python", "-m", "worker"]
CMD ["replay"]
