"""Fila de alertas e trabalho do analista sobre cada alerta.

TODO (frente 4, com frentes 2 e 3):
- GET  /alertas?semana=&status=&pais=      — fila paginada da semana
- GET  /alertas/{id}                       — detalhe + evidências
- GET  /alertas/{id}/grafo                 — grafo de 2 saltos (Cytoscape)
- POST /alertas/{id}/parecer               — gera parecer com RAG (LLM no servidor)
- POST /alertas/{id}/decisao               — arquivar/aprofundar/comunicar + justificativa
- GET  /alertas/{id}/comunicacao           — rascunho da comunicação ao COAF
- POST /alertas/{id}/comunicacao/aprovar   — aprova o rascunho (nome do analista)
- POST /alertas/{id}/chat                  — perguntas do analista ao agente
"""

from fastapi import APIRouter

router = APIRouter(prefix="/alertas", tags=["alertas"])
