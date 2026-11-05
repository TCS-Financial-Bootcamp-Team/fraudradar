# ============================================================
# FRAUDRADAR — AUDITORIA DO LIMIAR F1
# Limiar escolhido na validação e aplicado no teste
# ============================================================

from pathlib import Path
import numpy as np
import pandas as pd

from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score
)

from fraudradar.data.saml_d import load_csv
from fraudradar.features.history import compute_features
from fraudradar.model.training import build_training_data, load_model
from fraudradar.model.evaluation import best_f1_threshold


# ============================================================
# 1. CARREGAR DADOS E MODELO
# ============================================================

csv = Path.home() / "Downloads" / "archive" / "SAML-D.csv"

print("=" * 70)
print("FRAUDRADAR — REPRODUÇÃO DO F1 OFICIAL")
print("=" * 70)

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

y = truth["y"].to_numpy(dtype=np.int8)

validacao = data.validation
teste = data.test

assert np.isfinite(scores).all()
assert not np.any(validacao & teste)


# ============================================================
# 2. ESCOLHER O LIMIAR F1 NA VALIDAÇÃO
# ============================================================

threshold_f1 = best_f1_threshold(
    y[validacao],
    scores[validacao]
)

print("\n=== LIMIAR F1 ===")
print(f"Limiar escolhido na validação: {threshold_f1:.12f}")

print("\n=== REFERÊNCIA REGISTRADA NA FICHA ===")

metricas_oficiais = card["metrics"]

print(f"F1 oficial: {metricas_oficiais['f1']:.6f}")
print(f"Precisão oficial: {metricas_oficiais['f1_precision']:.6f}")
print(f"Recall oficial: {metricas_oficiais['f1_recall']:.6f}")


# ============================================================
# 3. FUNÇÃO PARA CALCULAR AS MÉTRICAS
# ============================================================

def avaliar_f1(nome, mask):

    y_parcial = y[mask]
    scores_parciais = scores[mask]

    # Importante: para F1, o código original utiliza >=
    alertas = scores_parciais >= threshold_f1

    f1 = f1_score(
        y_parcial,
        alertas,
        zero_division=0
    )

    precisao = precision_score(
        y_parcial,
        alertas,
        zero_division=0
    )

    recall = recall_score(
        y_parcial,
        alertas,
        zero_division=0
    )

    positivos = y_parcial == 1
    negativos = y_parcial == 0

    tp = int((alertas & positivos).sum())
    fp = int((alertas & negativos).sum())
    fn = int((~alertas & positivos).sum())
    tn = int((~alertas & negativos).sum())

    fpr = fp / int(negativos.sum()) if negativos.any() else 0

    return {
        "Conjunto": nome,
        "Limiar F1": threshold_f1,
        "F1": f1,
        "Precisão (%)": precisao * 100,
        "Recall (%)": recall * 100,
        "FPR (%)": fpr * 100,
        "TP": tp,
        "FP": fp,
        "FN": fn,
        "TN": tn,
        "Alertas": tp + fp
    }


# ============================================================
# 4. AVALIAR NA VALIDAÇÃO E NO TESTE
# ============================================================

resultados = pd.DataFrame([

    avaliar_f1("Validação", validacao),

    avaliar_f1("Teste", teste)

])


# ============================================================
# 5. RESULTADOS
# ============================================================

print("\n" + "=" * 70)
print("RESULTADOS COM O MESMO LIMIAR F1")
print("=" * 70)

print(resultados.round(6).to_string(index=False))


# ============================================================
# 6. COMPARAÇÃO COM A FICHA OFICIAL
# ============================================================

resultado_teste = resultados[
    resultados["Conjunto"] == "Teste"
].iloc[0]

print("\n" + "=" * 70)
print("COMPARAÇÃO COM AS MÉTRICAS OFICIAIS")
print("=" * 70)

comparacao = pd.DataFrame([

    {
        "Métrica": "F1",
        "Ficha oficial": metricas_oficiais["f1"],
        "Reproduzido": resultado_teste["F1"]
    },

    {
        "Métrica": "Precisão",
        "Ficha oficial": metricas_oficiais["f1_precision"] * 100,
        "Reproduzido": resultado_teste["Precisão (%)"]
    },

    {
        "Métrica": "Recall",
        "Ficha oficial": metricas_oficiais["f1_recall"] * 100,
        "Reproduzido": resultado_teste["Recall (%)"]
    }

])

comparacao["Diferença absoluta"] = abs(
    comparacao["Ficha oficial"] - comparacao["Reproduzido"]
)

print(comparacao.round(8).to_string(index=False))


# ============================================================
# 7. VERIFICAÇÃO FINAL
# ============================================================

print("\n" + "=" * 70)
print("AUDITORIA F1 FINALIZADA")
print("=" * 70)

print("Modelo:", card["file"])
print("Versão:", card["version"])
print(f"Limiar escolhido na validação: {threshold_f1:.12f}")

print("\nO teste recebeu o limiar escolhido na validação.")
print("Nenhum treinamento foi realizado.")
print("Os arquivos originais do parceiro permanecem intactos.")
