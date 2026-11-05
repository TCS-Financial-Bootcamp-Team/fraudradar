"""Linha de comando do modelo.

python -m fraudradar.model train   # treina o LightGBM oficial e grava uma versão nova (~4 min)
python -m fraudradar.model check   # explica 10 alertas da versão mais nova e mostra os segmentos

O SAML-D é lido de DATA_DIR/SAML-D.csv (ou de --csv) e o modelo vai para MODEL_DIR. Precisa do
grupo `ml`:  uv sync --group ml
"""

import argparse
from pathlib import Path

import pandas as pd

from fraudradar.config import get_settings
from fraudradar.data.saml_d import load_csv
from fraudradar.model.check import check_model
from fraudradar.model.training import save_model


def _parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--csv", type=Path, help="caminho do SAML-D.csv (padrão: DATA_DIR/SAML-D.csv)"
    )
    p = argparse.ArgumentParser(
        prog="python -m fraudradar.model", description="Modelo de score do FraudRadar (LightGBM)"
    )
    sub = p.add_subparsers(dest="command", required=True)
    sub.add_parser(
        "train", parents=[common], help="treina o LightGBM oficial e grava uma versão nova"
    )
    sub.add_parser(
        "check", parents=[common], help="explica 10 alertas da versão mais nova e os segmentos"
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    transactions, ground_truth = load_csv(args.csv or get_settings().data_dir / "SAML-D.csv")
    if args.command == "train":
        card = save_model(transactions, ground_truth)
        m, queue = card["metrics"], card["metrics"]["queue_with_cut"]
        print(f"Modelo v{card['version']} gravado em {get_settings().model_dir / card['file']}")
        print(
            f"{card['trees']} árvores; segmentos do K-Means: {len(card['segments']['centroids'])}"
        )
        print(
            f"Teste: PR-AUC {m['pr_auc']:.3f} | recall com 0,13% de falso positivo "
            f"{m['recall_at_fpr']:.1%} | F1 {m['f1']:.3f}"
        )
        print(
            f"Fila com corte: recall {queue['recall']:.1%}, precisão {queue['precision']:.1%}, "
            f"{queue['innocents_per_week']:.1f} inocentes por semana"
        )
        return 0

    alerts, segments, bias = check_model(transactions, ground_truth)
    print("Alertas sorteados da fila do teste, com as variáveis que mais pesaram:\n")
    for a in alerts.itertuples():
        who = "lavadora" if a.launderer else "INOCENTE"
        role = "enviou" if a.role == "sent" else "recebeu"
        print(
            f"{a.week} conta {a.account} ({who}, score {a.score:.3f}): {role} {a.amount:,.0f} "
            f"por {a.payment_type}; tipologia da transação: {a.typology}"
        )
        print(f"   {a.reasons}\n")
    with pd.option_context("display.width", 250):
        print("Segmentos do K-Means (perfil típico = mediana; taxas no teste):")
        print(segments.round(6).to_string(index=False))
        print("\nFalso positivo por grupo, com o limiar da validação (grupos com 1.000+ normais):")
        big = bias[bias["normal"] >= 1000]
        print(big.sort_values(["group", "fpr"]).round(6).to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
