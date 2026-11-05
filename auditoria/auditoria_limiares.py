# ============================================================
# FRAUDRADAR — AUDITORIA EXPERIMENTAL DE LIMIARES
# Arquivos do parceiro permanecem intactos
# ============================================================

from pathlib import Path
import numpy as np
import pandas as pd

from fraudradar.data.saml_d import load_csv
from fraudradar.features.history import compute_features
from fraudradar.model import TARGET_FPR
from fraudradar.model.training import build_training_data, load_model
from fraudradar.model.evaluation import recall_at_fpr


# ============================================================
# 1. CARREGAR DADOS E MODELO JÁ TREINADO
# ============================================================

csv = Path.home() / "Downloads" / "archive" / "SAML-D.csv"

print("=" * 70)
print("FRAUDRADAR — AUDITORIA DE LIMIARES")
print("=" * 70)

transactions, ground_truth = load_csv(csv)

print("\nDados carregados:", len(transactions))

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
assert validacao.any() and teste.any()
assert not np.any(validacao & teste)

print("\n=== CONJUNTOS ===")
print("Validação:", int(validacao.sum()))
print("Teste:", int(teste.sum()))
print("Positivas na validação:", int(y[validacao].sum()))
print("Positivas no teste:", int(y[teste].sum()))


# ============================================================
# 2. CALCULAR OS DOIS LIMIARES
# ============================================================

_, threshold_val = recall_at_fpr(
    y[validacao],
    scores[validacao],
    TARGET_FPR
)

_, threshold_test = recall_at_fpr(
    y[teste],
    scores[teste],
    TARGET_FPR
)

threshold_salvo = float(card["transaction_threshold"])

print("\n=== LIMIARES ===")
print(f"Limite FPR desejado: {TARGET_FPR:.4%}")
print(f"Limiar calculado na validação: {threshold_val:.10f}")
print(f"Limiar armazenado na ficha: {threshold_salvo:.10f}")
print(f"Limiar calculado no teste: {threshold_test:.10f}")

print(
    "Diferença entre limiar recalculado e armazenado:",
    f"{abs(threshold_val - threshold_salvo):.12f}"
)


# ============================================================
# 3. FUNÇÃO DE AVALIAÇÃO
# ============================================================

def calcular_metricas(nome, threshold, mask):

    yy = y[mask]
    pred = scores[mask] > threshold

    positivos = yy == 1
    negativos = yy == 0

    tp = int((pred & positivos).sum())
    fp = int((pred & negativos).sum())
    fn = int((~pred & positivos).sum())
    tn = int((~pred & negativos).sum())

    recall = tp / (tp + fn) if tp + fn else 0
    fpr = fp / (fp + tn) if fp + tn else 0
    precision = tp / (tp + fp) if tp + fp else 0

    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall else 0
    )

    return {
        "Cenário": nome,
        "Limiar": threshold,
        "FPR (%)": fpr * 100,
        "Recall (%)": recall * 100,
        "Precisão (%)": precision * 100,
        "F1": f1,
        "TP": tp,
        "FP": fp,
        "FN": fn,
        "TN": tn
    }


# ============================================================
# 4. QUATRO CENÁRIOS
# ============================================================

resultados = [

    calcular_metricas(
        "A - Validação -> Validação",
        threshold_val,
        validacao
    ),

    calcular_metricas(
        "B - Validação -> Teste",
        threshold_val,
        teste
    ),

    calcular_metricas(
        "C - Teste -> Teste (diagnóstico)",
        threshold_test,
        teste
    ),

    calcular_metricas(
        "D - Teste -> Validação (diagnóstico)",
        threshold_test,
        validacao
    )

]

df_resultados = pd.DataFrame(resultados)


# ============================================================
# 5. RESULTADOS
# ============================================================

print("\n" + "=" * 70)
print("COMPARAÇÃO DOS QUATRO CENÁRIOS")
print("=" * 70)

print(df_resultados.round(6).to_string(index=False))

print("\n=== RESUMO ===")

for _, row in df_resultados.iterrows():

    print(f"\n{row['Cenário']}")
    print(f"Limiar: {row['Limiar']:.10f}")
    print(f"FPR: {row['FPR (%)']:.4f}%")
    print(f"Recall: {row['Recall (%)']:.4f}%")
    print(f"Precisão: {row['Precisão (%)']:.4f}%")
    print(f"F1: {row['F1']:.6f}")
    print(f"TP: {row['TP']} | FP: {row['FP']}")
    print(f"FN: {row['FN']} | TN: {row['TN']}")


# ============================================================
# 6. VERIFICAÇÃO
# ============================================================

print("\n" + "=" * 70)
print("AUDITORIA FINALIZADA")
print("=" * 70)

print("Modelo utilizado:", card["file"])
print("Versão:", card["version"])
print("Limiar oficial salvo na validação:", threshold_salvo)
print("Target FPR:", TARGET_FPR)
print("\nOs arquivos originais do modelo não foram alterados.")
