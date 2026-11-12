from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dependencies import get_current_user
from api.routes import (
    accounts,
    ai,
    alerts,
    datasets,
    decisions,
    feedback,
    health,
    ingestion,
    monitoring,
    processing,
    replay,
    weeks,
)
from api.routes import models as model_routes
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
    for module in (
        weeks,
        accounts,
        alerts,
        decisions,
        ai,
        replay,
        monitoring,
        ingestion,
        datasets,
        processing,
        feedback,
    ):
        app.include_router(module.router, dependencies=protected)
    app.include_router(model_routes.router, dependencies=protected)
    return app


app = create_app()
