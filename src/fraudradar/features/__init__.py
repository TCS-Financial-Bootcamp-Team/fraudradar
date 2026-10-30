"""Engenharia de features por conta.

Vão aqui: histórico da conta, sinais semanais (volume, fan-in/fan-out,
países, moedas) e features de grafo. Única fonte de features do projeto.
"""

# Nome legível de cada feature, exibido no detalhe do alerta (contribuições).
# Preencha junto com as features; sem entrada, a API mostra o nome técnico.
FEATURE_LABELS: dict[str, str] = {}


def feature_label(name: str) -> str:
    return FEATURE_LABELS.get(name, name)
