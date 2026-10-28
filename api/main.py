from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dependencias import usuario_atual
from api.rotas import alertas, decisoes, ia, ingestao, monitoramento, replay, saude, semanas
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
    # /saude fica aberta: o healthcheck do Compose não tem sessão.
    app.include_router(saude.router)
    protegidas = [Depends(usuario_atual)]
    for modulo in (semanas, alertas, decisoes, ia, replay, monitoramento, ingestao):
        app.include_router(modulo.router, dependencies=protegidas)
    return app


app = criar_app()
