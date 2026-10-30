from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dependencies import get_current_user
from api.routes import ai, alerts, decisions, health, ingestion, monitoring, replay, weeks
from fraudradar import __version__
from fraudradar.config import get_settings


def create_app() -> FastAPI:
    app = FastAPI(title="FraudRadar PLD", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # /health fica aberta: o healthcheck do Compose não tem sessão.
    app.include_router(health.router)
    protected = [Depends(get_current_user)]
    for module in (weeks, alerts, decisions, ai, replay, monitoring, ingestion):
        app.include_router(module.router, dependencies=protected)
    return app


app = create_app()
