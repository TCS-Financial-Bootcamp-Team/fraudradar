"""Semanas disponíveis para a fila de alertas.

TODO (frente 4):
- GET /semanas — semanas já processadas pelo worker, com contagem de alertas.
"""

from fastapi import APIRouter

router = APIRouter(tags=["semanas"])
