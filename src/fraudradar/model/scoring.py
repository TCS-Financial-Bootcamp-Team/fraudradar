"""A entrada do modelo a partir de uma ficha, a mesma no lote do worker e na comparação de versões.

O score é ``booster.predict(model_input(features, card)[0])``, com as variáveis de
``fraudradar.features.history.compute_features``. Sem LightGBM: só monta a tabela.
"""

import pandas as pd


def model_input(features: pd.DataFrame, card: dict) -> tuple[pd.DataFrame, dict[str, int]]:
    """As variáveis do modelo na ordem de `card["features"]`, com as categorias exatas da
    ficha, na ordem dela.

    Valor que a ficha não conhece (ex.: um meio de pagamento novo vindo da ingestão) vira nulo,
    nunca categoria nova. Devolve também quantos valores viraram nulo em cada coluna.
    """
    x = features[card["features"]].copy()
    unknown = {}
    for column, categories in card["categories"].items():
        before = int(x[column].notna().sum())
        x[column] = x[column].astype("category").cat.set_categories(categories)
        unknown[column] = before - int(x[column].notna().sum())
    return x, unknown
