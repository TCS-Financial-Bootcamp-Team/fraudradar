"""Segmentos de contas (K-Means), gravados em `accounts.segment`. Ficam fora do score.

Servem para o perfil da conta na tela e para medir a taxa de alerta por segmento. Sem rótulo:
o K-Means só vê o perfil (`features.history.account_profile`).
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score


def fit_segments(profiles: pd.DataFrame, ks=range(3, 9), seed: int = 0) -> dict:
    """K-Means sobre o perfil das contas: segmentos de contas parecidas.

    As variáveis vão para log e são padronizadas. O número de segmentos é o de maior silhueta
    (de -1 a 1; quanto maior, mais separados), medida numa amostra de 20 mil contas. Devolve o
    que `assign_segments` usa.
    """
    z = np.log1p(profiles.to_numpy("float64"))
    mean, std = z.mean(axis=0), z.std(axis=0) + 1e-9
    z = (z - mean) / std
    sample = np.random.default_rng(seed).choice(len(z), min(20_000, len(z)), replace=False)
    # Conjuntos pequenos: o K-Means precisa de menos grupos que contas e a silhueta de pelo menos 2.
    ks = [k for k in ks if 2 <= k < len(z)] or [min(2, len(z) - 1)]
    fits = {k: KMeans(k, n_init=5, random_state=seed).fit(z) for k in ks}
    silhouette = {k: float(silhouette_score(z[sample], f.labels_[sample])) for k, f in fits.items()}
    k = max(silhouette, key=silhouette.get)
    return {
        "features": list(profiles.columns),
        "mean": mean.tolist(),
        "std": std.tolist(),
        "centroids": fits[k].cluster_centers_.tolist(),
        "silhouette": {str(n): s for n, s in silhouette.items()},
    }


def assign_segments(profiles: pd.DataFrame, segments: dict) -> pd.Series:
    """O segmento de cada conta: o centro mais perto do perfil dela."""
    values = np.log1p(profiles[segments["features"]].to_numpy("float64"))
    z = (values - segments["mean"]) / segments["std"]
    centroids = np.array(segments["centroids"])
    distances = np.stack([((z - c) ** 2).sum(axis=1) for c in centroids], axis=1)
    return pd.Series(distances.argmin(axis=1), index=profiles.index, name="segment")
