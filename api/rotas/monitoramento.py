"""Monitoramento do modelo e da fila.

TODO (frentes 2 e 4):
- GET /monitoramento — métricas por semana, versão do modelo ativa, volume de decisões.
"""

from fastapi import APIRouter

router = APIRouter(tags=["monitoramento"])
