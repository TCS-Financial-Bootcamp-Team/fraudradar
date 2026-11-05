# ============================================================
# FRAUDRADAR — AUDITORIA DA FILA SEMANAL
# Corte escolhido na validação e aplicado no teste
# ============================================================

from pathlib import Path
import pandas as pd
import numpy as np

from fraudradar.data.saml_d import load_csv
from fraudradar.features.history import compute_features
from fraudradar.model.training import build_training_data, load_model
from fraudradar.model.evaluation import queue_with_cut


# ============================================================
# 1. CARREGAR DADOS E MODELO
# ============================================================

csv = Path.home() / "Downloads" / "archive" / "SAML-D.csv"

print("=" * 75)
print("FRAUDRADAR — AUDITORIA DA FILA SEMANAL")
print("=" * 75)

transactions, ground_truth = load_csv(csv)

print("\nTransações:", len(transactions))

features = compute_features(transactions)

data, truth = build_training_data(
    transactions,
    ground_truth,
    features
)

booster, card = load_model()

X = data.x[card["features"]]
scores = booster.predict(X)

assert np.isfinite(scores).all()

print("Versão do modelo:", card["version"])
print("Árvores:", card["trees"])
print("Fila máxima:", card["queue_size"])


# ============================================================
# 2. CALCULAR FILA FIXA E FILA COM CORTE DE 95%
# ============================================================

resultados_fila = queue_with_cut(
    scores,
    data,
    truth,
    targets=(0.95,)
)

print("\n" + "=" * 75)
print("RESULTADOS CALCULADOS")
print("=" * 75)

print(resultados_fila.round(10).to_string(index=False))


# ============================================================
# 3. RECUPERAR RESULTADOS DA FICHA OFICIAL
# ============================================================

metricas = card["metrics"]

fila_oficial_fixa = {
    "recall": metricas["queue_recall"],
    "precision": metricas["queue_precision"]
}

fila_oficial_corte = metricas["queue_with_cut"]

print("\n" + "=" * 75)
print("REFERÊNCIA DA FICHA OFICIAL")
print("=" * 75)

print("\n=== FILA FIXA DE 300 ===")

for chave, valor in fila_oficial_fixa.items():
    print(f"{chave}: {valor:.10f}")

print("\n=== FILA COM CORTE ===")

for chave, valor in fila_oficial_corte.items():
    print(f"{chave}: {valor:.10f}")

print("\nQueue cut armazenado:", card["queue_cut"])


# ============================================================
# 4. COMPARAR REPRODUÇÃO COM A FICHA
# ============================================================

fila_95 = resultados_fila[
    resultados_fila["target"] == 0.95
].iloc[0]

comparacao = pd.DataFrame([

    {
        "Métrica": "Corte da fila",
        "Ficha oficial": card["queue_cut"],
        "Reproduzido": fila_95["cut"]
    },

    {
        "Métrica": "Recall (%)",
        "Ficha oficial": fila_oficial_corte["recall"] * 100,
        "Reproduzido": fila_95["recall"] * 100
    },

    {
        "Métrica": "Precisão (%)",
        "Ficha oficial": fila_oficial_corte["precision"] * 100,
        "Reproduzido": fila_95["precision"] * 100
    },

    {
        "Métrica": "Contas por semana",
        "Ficha oficial": fila_oficial_corte["accounts_per_week"],
        "Reproduzido": fila_95["accounts_per_week"]
    },

    {
        "Métrica": "Inocentes por semana",
        "Ficha oficial": fila_oficial_corte["innocents_per_week"],
        "Reproduzido": fila_95["innocents_per_week"]
    }

])

comparacao["Diferença absoluta"] = abs(
    comparacao["Ficha oficial"] - comparacao["Reproduzido"]
)

print("\n" + "=" * 75)
print("COMPARAÇÃO: FICHA OFICIAL X REPRODUÇÃO")
print("=" * 75)

print(comparacao.round(10).to_string(index=False))


# ============================================================
# 5. VERIFICAÇÃO FINAL
# ============================================================

print("\n" + "=" * 75)
print("AUDITORIA DA FILA FINALIZADA")
print("=" * 75)

print("Modelo:", card["file"])
print("Semana iniciada em:", card["week_start"])
print("Fila máxima:", card["queue_size"])
print("Meta de recall na validação:", 95)

print("\nCorte escolhido exclusivamente na validação.")
print("Métricas da fila calculadas no teste.")
print("Arquivos originais do parceiro permanecem intactos.")
