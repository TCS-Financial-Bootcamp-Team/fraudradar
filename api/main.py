from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.rotas import alertas, monitoramento, replay, saude, semanas
from fraudradar import __version__
from fraudradar.config import get_settings


def criar_app() -> FastAPI:
    app = FastAPI(title="FraudRadar PLD", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for modulo in (saude, semanas, alertas, replay, monitoramento):
        app.include_router(modulo.router)
    return app


app = criar_app()
