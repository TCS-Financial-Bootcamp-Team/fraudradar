"""Treino do LightGBM oficial: a base com a divisão no tempo, o modelo, a explicação e a gravação.

Configuração oficial: 21 variáveis, sem país, moeda e hora (`EXCLUDED_FEATURES`), porque elas
criam atalhos do gerador ("todo saque em espécie no exterior é lavagem") e diferença de falso
positivo entre países. O rótulo só entra como alvo do treino e na avaliação: o score de uma
transação usa só as variáveis, e o modelo nunca vê o gabarito do teste.
"""

import json
import platform
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn import __version__ as sklearn_version

from fraudradar.config import get_settings
from fraudradar.features.history import (
    CASH_ACCOUNT,
    COUNTRY_FEATURES,
    account_profile,
    compute_features,
    week_start,
    with_cash_account,
)
from fraudradar.model import QUEUE_SIZE, QUEUE_TARGET, TRAIN_END, VALIDATION_START
from fraudradar.model.evaluation import evaluate, find_shortcuts, queue_with_cut, recall_at_fpr
from fraudradar.model.segments import fit_segments

# Fora do modelo: país e moeda permitem atalhos do gerador e aumentam a diferença de falso
# positivo entre países de destino; com a hora, "todo depósito em espécie fora do horário
# comercial é lavagem". Sem elas, o desempenho fora dos atalhos fica igual.
EXCLUDED_FEATURES = (*COUNTRY_FEATURES, "hour")

# Escolhidos pela validação: árvores pequenas e regularizadas. Com árvores maiores (63 folhas e
# mínimo de 100 por folha), o modelo decorava as poucas lavagens do treino.
LIGHTGBM_PARAMS = {
    "n_estimators": 5000,
    "learning_rate": 0.05,
    "num_leaves": 15,
    "min_child_samples": 1000,
    "reg_lambda": 10,
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.8,
}


@dataclass
class TrainingData:
    """O que o modelo recebe. Uma posição por transação, em ordem de tempo, igual em todos os
    campos."""

    x: pd.DataFrame  # variáveis (ver features/history.py)
    y: np.ndarray  # 1 = lavagem, 0 = normal, -1 = teste (escondido do modelo)
    sender: np.ndarray  # contas, com o CAIXA no outro lado da espécie
    receiver: np.ndarray
    train: np.ndarray  # máscaras da divisão no tempo
    validation: np.ndarray
    test: np.ndarray


def build_training_data(
    transactions: pd.DataFrame,
    ground_truth: pd.DataFrame,
    features: pd.DataFrame,
    excluded=EXCLUDED_FEATURES,
) -> tuple[TrainingData, pd.DataFrame]:
    """Alinha tudo na ordem das variáveis e separa o gabarito, que só a avaliação lê.

    O gabarito volta numa tabela à parte (`truth`), com a semana de cada transação, a tipologia,
    os atalhos do gerador e os grupos para medir viés. `excluded`: variáveis a tirar do modelo.
    """
    ids = features["id"].to_numpy()
    tx = with_cash_account(transactions).set_index("id").loc[ids]
    labels = ground_truth.set_index("transaction_id").loc[ids]
    when = tx["occurred_at"]
    until_train_end = (when < pd.Timestamp(TRAIN_END) + pd.Timedelta(days=1)).to_numpy()
    validation = until_train_end & (when >= VALIDATION_START).to_numpy()
    y = labels["label"].to_numpy("int8")
    data = TrainingData(
        x=features.drop(columns=["id", *excluded]).reset_index(drop=True),
        y=np.where(until_train_end, y, -1).astype("int8"),
        sender=tx["sender"].to_numpy(),
        receiver=tx["receiver"].to_numpy(),
        train=until_train_end & ~validation,
        validation=validation,
        test=~until_train_end,
    )
    # Os atalhos são procurados em todas as variáveis, mesmo nas tiradas do modelo: é uma
    # propriedade do dado.
    rules, shortcut = find_shortcuts(features.drop(columns="id"), y, data.train)
    # Contas que já lavaram antes do teste reaparecem nele, como num banco de verdade.
    laundered = until_train_end & (y == 1)
    known = np.union1d(data.sender[laundered], data.receiver[laundered])
    known = np.setdiff1d(known, [CASH_ACCOUNT])
    truth = pd.DataFrame(
        {
            "y": y,
            "typology": labels["typology"].astype(str).to_numpy(),
            "week": week_start(when).to_numpy(),
            "shortcut": shortcut,
            "known_account": np.isin(data.sender, known) | np.isin(data.receiver, known),
            "payment_type": tx["payment_type"].astype(str).to_numpy(),
            "sender_country": tx["sender_country"].astype(str).to_numpy(),
            "receiver_country": tx["receiver_country"].astype(str).to_numpy(),
        }
    )
    truth.attrs["shortcuts"] = rules
    return data, truth


def train_lightgbm(data: TrainingData) -> lgb.LGBMClassifier:
    """Árvores em sequência, cada uma corrigindo o erro das anteriores.

    Lê as variáveis direto (aceita nulos e categorias) e para quando a validação deixa de
    melhorar.
    """
    model = lgb.LGBMClassifier(**LIGHTGBM_PARAMS, metric="average_precision", verbose=-1)
    model.fit(
        data.x[data.train],
        data.y[data.train],
        eval_X=data.x[data.validation],
        eval_y=data.y[data.validation],
        callbacks=[lgb.early_stopping(200, verbose=False)],
    )
    return model


def explain(booster: lgb.Booster, x: pd.DataFrame, top: int = 5) -> list[list[dict]]:
    """Por que cada transação recebeu o score: as `top` variáveis que mais empurraram para
    "lavagem".

    Usa a contribuição de cada variável calculada pelo próprio LightGBM (`pred_contrib`, o mesmo
    cálculo do SHAP), em log-odds, como vai para `evidence.contributions`: somadas a uma base
    igual para todas as transações, dão o score bruto (antes de virar probabilidade). `x` com as
    colunas na ordem de `card["features"]`.
    """
    contributions = booster.predict(x, pred_contrib=True)[:, :-1]  # a última coluna é a base
    return [
        [
            {"feature": x.columns[j], "value": x.iat[i, j], "contribution": float(row[j])}
            for j in (-row).argsort()[:top]
        ]
        for i, row in enumerate(contributions)
    ]


def save_model(transactions: pd.DataFrame, ground_truth: pd.DataFrame, folder=None) -> dict:
    """Treina o LightGBM na configuração oficial e grava uma versão nova em `folder`
    (padrão: MODEL_DIR): o modelo (`lightgbm_vN.txt`) e a ficha (`lightgbm_vN.json`), com as
    variáveis, os cortes escolhidos na validação e as métricas no teste. Também copia o modelo
    para MODEL_FILE (`lightgbm_model.txt`), o arquivo que o health da API confere.

    As variáveis são calculadas aqui, com o código atual, e nunca lidas de um arquivo guardado.
    """
    folder = Path(folder or get_settings().model_dir)
    data, truth = build_training_data(transactions, ground_truth, compute_features(transactions))
    model = train_lightgbm(data)
    score = model.predict_proba(data.x)[:, 1]
    metrics, by_typology = evaluate(score, data, truth)
    queue = queue_with_cut(score, data, truth, targets=(QUEUE_TARGET,)).iloc[-1]
    y, va, te = truth["y"].to_numpy(), data.validation, data.test
    threshold = recall_at_fpr(y[va], score[va])[1]
    profiles = account_profile(transactions, until=pd.Timestamp(TRAIN_END) + pd.Timedelta(days=1))
    version = 1 + max(_versions(folder), default=0)
    name = f"lightgbm_v{version}"
    folder.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(folder / f"{name}.txt", num_iteration=model.best_iteration_)
    queue_keys = ["recall", "precision", "f1", "accounts_per_week", "innocents_per_week"]
    card = {
        "version": version,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "file": f"{name}.txt",
        "features": list(data.x.columns),
        "categories": {c: list(data.x[c].cat.categories) for c in data.x.select_dtypes("category")},
        "excluded_features": list(EXCLUDED_FEATURES),
        "params": LIGHTGBM_PARAMS,
        "trees": int(model.best_iteration_),
        "history_start": transactions["occurred_at"].min().date().isoformat(),
        "validation_start": VALIDATION_START,
        "train_end": TRAIN_END,
        "week_start": "monday",
        "transaction_threshold": float(threshold),
        "queue_size": QUEUE_SIZE,
        "queue_cut": float(queue["cut"]),
        "segments": fit_segments(profiles),
        "metrics": {
            **{k: float(v) for k, v in metrics.items()},
            "test_fpr_at_threshold": float((score[te & (y == 0)] > threshold).mean()),
            "test_recall_at_threshold": float((score[te & (y == 1)] > threshold).mean()),
            "queue_with_cut": {k: float(queue[k]) for k in queue_keys},
        },
        "recall_by_typology": by_typology.round(4).to_dict(),
        "libraries": {
            "python": platform.python_version(),
            "lightgbm": lgb.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
            "scikit-learn": sklearn_version,
        },
        "notes": [
            "Score de cada transação: booster.predict(x[features]), com x calculado por "
            "fraudradar.features.history.compute_features",
            "transaction_threshold: score com 0,13% de falso positivo na validação; acima dele, "
            "a transação é alerta",
            f"queue_cut: score mínimo da conta na semana (de segunda a domingo) para entrar na "
            f"fila (manteve {QUEUE_TARGET:.0%} das contas lavadoras na validação); a fila tem no "
            "máximo queue_size contas por semana",
            "As contagens do histórico (ex.: sender_sent_count) começam em history_start: o "
            "worker precisa do mesmo início",
            "O CAIXA (conta -1) é o outro lado de todo saque e depósito em espécie e não entra "
            "na fila",
            "Explicação de um alerta: training.explain(booster, x) com a transação de maior "
            "score da conta na semana",
            "segments: K-Means do perfil das 12 semanas antes de train_end; segmento de uma "
            "conta: segments.assign_segments",
        ],
    }
    # UTF-8 explícito: no Windows o padrão é cp1252, e o worker no Docker (Linux) lê em UTF-8.
    (folder / f"{name}.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    shutil.copyfile(folder / f"{name}.txt", folder / get_settings().model_file)
    return card


def load_model(folder=None, version: int | None = None) -> tuple[lgb.Booster, dict]:
    """Um modelo gravado por `save_model` (o mais novo, se `version` não for dada) e a ficha."""
    folder = Path(folder or get_settings().model_dir)
    versions = _versions(folder)
    if not versions:
        raise FileNotFoundError(
            f"nenhum modelo em {folder}: rode  python -m fraudradar.model train"
        )
    card_path = folder / f"lightgbm_v{version or max(versions)}.json"
    card = json.loads(card_path.read_text(encoding="utf-8"))
    return lgb.Booster(model_file=folder / card["file"]), card


def _versions(folder: Path) -> list[int]:
    return [int(p.stem.removeprefix("lightgbm_v")) for p in folder.glob("lightgbm_v*.json")]
