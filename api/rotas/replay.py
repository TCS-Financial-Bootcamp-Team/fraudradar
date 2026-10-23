"""Replay da demonstração.

TODO (frente 4):
- POST /replay/proxima-semana — dispara o worker para processar a próxima semana.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/replay", tags=["replay"])
