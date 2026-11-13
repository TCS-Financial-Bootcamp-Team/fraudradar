"""Treino do LightGBM oficial: a base com a divisão no tempo, o modelo, a explicação e a gravação.

Configuração oficial: 21 variáveis, sem país, moeda e hora (`EXCLUDED_FEATURES`), porque elas
criam atalhos do gerador ("todo saque em espécie no exterior é lavagem") e diferença de falso
positivo entre países. O rótulo só entra como alvo do treino e na avaliação: o score de uma
transação usa só as variáveis, e o modelo nunca vê o gabarito do teste.
"""

import json
import platform
import shutil
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field, replace
from datetime import datetime
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn import __version__ as sklearn_version
from sklearn.metrics import average_precision_score

from fraudradar.config import get_settings
from fraudradar.features.history import (
    CASH_ACCOUNT,
    COUNTRY_FEATURES,
    account_profile,
    compute_features,
    week_start,
    with_cash_account,
)
from fraudradar.model import (
    FEEDBACK_POSITIVE_TOP,
    FEEDBACK_WEIGHT,
    MIN_FEEDBACK_LABELS,
    MIN_TEST_WEEKS,
    OFFICIAL_DATASET,
    PROMOTION_RECALL_TOLERANCE,
    QUEUE_SIZE,
    QUEUE_TARGET,
    TRAIN_END,
    VALIDATION_START,
)
from fraudradar.model.evaluation import (
    account_weeks,
    evaluate,
    find_shortcuts,
    queue_with_cut,
    recall_at_fpr,
    weekly_queue,
)
from fraudradar.model.scoring import model_input
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


@dataclass(frozen=True)
class Split:
    """Divisão no tempo em semanas inteiras: treino até `train_end` (domingo, inclusive), sendo
    as semanas desde `validation_start` (segunda) a validação; o teste vem depois."""

    train_end: str
    validation_start: str


OFFICIAL_SPLIT = Split(TRAIN_END, VALIDATION_START)
# Conjuntos que não cobrem as datas do SAML-D: a última fração das semanas vira teste e as
# semanas antes dele, validação (no máximo 4, como no oficial).
TEST_SHARE = 0.25
VALIDATION_SHARE = 0.15
MAX_VALIDATION_WEEKS = 4


def resolve_split(transactions: pd.DataFrame) -> Split:
    """A divisão oficial quando o dado a cobre (o SAML-D); senão uma proporcional, sempre no
    tempo e em semanas inteiras."""
    first, last = transactions["occurred_at"].min(), transactions["occurred_at"].max()
    covers_official = first < pd.Timestamp(VALIDATION_START) and last >= pd.Timestamp(
        TRAIN_END
    ) + pd.Timedelta(days=1)
    if covers_official:
        return OFFICIAL_SPLIT
    monday = first.normalize() - pd.Timedelta(days=first.weekday())
    last_monday = last.normalize() - pd.Timedelta(days=last.weekday())
    weeks = (last_monday - monday).days // 7 + 1
    test_weeks = max(1, round(weeks * TEST_SHARE))
    validation_weeks = max(1, min(MAX_VALIDATION_WEEKS, round(weeks * VALIDATION_SHARE)))
    train_end = monday + pd.Timedelta(weeks=weeks - test_weeks) - pd.Timedelta(days=1)
    validation_start = train_end + pd.Timedelta(days=1) - pd.Timedelta(weeks=validation_weeks)
    return Split(train_end.date().isoformat(), validation_start.date().isoformat())


def split_kind(split: Split) -> str:
    """Nome da divisão para a ficha: a oficial do SAML-D ou a proporcional de outro período."""
    return "official" if split == OFFICIAL_SPLIT else "proportional"


# --- retorno dos analistas -------------------------------------------------------------------


def resolve_feedback_split(truth_weeks: Sequence, feedback_weeks: Sequence) -> Split:
    """A divisão no tempo do retreino com o retorno dos analistas.

    O retorno vem das semanas em que o modelo já estava em uso, depois do treino oficial: com a
    divisão oficial, todo ele cairia no teste. Aqui o treino vai até o domingo da última semana
    com retorno, desde que sobrem pelo menos ``MIN_TEST_WEEKS`` semanas com gabarito depois do
    corte para medir a versão; se não sobram, o corte recua até sobrarem, e o retorno depois
    dele fica reservado para o teste. A validação são as últimas 4 semanas do treino, como na
    oficial. Sempre em semanas inteiras (de segunda a domingo) e nunca embaralhado.

    ``truth_weeks``: as segundas com transação rotulada pelo gabarito; ``feedback_weeks``: as
    segundas dos rótulos dos analistas.
    """
    weeks = sorted({pd.Timestamp(w) for w in truth_weeks})
    if not len(feedback_weeks):
        raise ValueError("não há retorno dos analistas para definir a divisão no tempo")
    if len(weeks) <= MIN_TEST_WEEKS + MAX_VALIDATION_WEEKS:
        raise ValueError(
            f"o gabarito cobre só {len(weeks)} semanas; o retreino com retorno precisa de mais de"
            f" {MIN_TEST_WEEKS + MAX_VALIDATION_WEEKS} (treino, validação e teste)"
        )
    last_feedback = max(pd.Timestamp(w) for w in feedback_weeks)
    train_end = last_feedback + pd.Timedelta(days=6)
    if sum(w > train_end for w in weeks) < MIN_TEST_WEEKS:
        train_end = weeks[-MIN_TEST_WEEKS] - pd.Timedelta(days=1)
    validation_start = train_end + pd.Timedelta(days=1) - pd.Timedelta(weeks=MAX_VALIDATION_WEEKS)
    return Split(train_end.date().isoformat(), validation_start.date().isoformat())


def _label_breakdown(labels: pd.DataFrame) -> dict:
    return {
        "total": len(labels),
        "by_class": {
            "laundering": int((labels["label"] == 1).sum()),
            "false_positive": int((labels["label"] == 0).sum()),
        },
        "by_source": {s: int((labels["source"] == s).sum()) for s in ("analyst", "simulated")},
        "by_origin": {o: int((labels["origin"] == o).sum()) for o in ("model", "exploration")},
    }


@dataclass
class FeedbackPlan:
    """O retorno dos analistas de um retreino: a divisão no tempo que ele define, em que parte
    da divisão cai cada rótulo e, depois de ``feedback_transactions``, o rótulo por transação
    dos rótulos que vão para o treino.

    Só os rótulos das semanas de treino (antes da validação) ganham peso: a validação, que
    decide quando parar o treino e onde cortar a fila, e o teste ficam só com o gabarito.
    """

    split: Split
    labels: pd.DataFrame  # colunas de read_feedback e `part`: train, validation ou test
    include_simulated: bool
    transactions: pd.DataFrame = field(
        default_factory=lambda: pd.DataFrame(
            {
                "transaction_id": pd.Series(dtype="int64"),
                "label": pd.Series(dtype="int8"),
                "has_truth": pd.Series(dtype="bool"),
            }
        )
    )

    def training_labels(self) -> pd.DataFrame:
        return self.labels[self.labels["part"] == "train"]

    def block_reason(self) -> str | None:
        """Por que, depois do corte, o retorno não serve para treinar; ``None`` quando serve."""
        used = self.training_labels()
        launderings = int((used["label"] == 1).sum())
        false_positives = len(used) - launderings
        reserved = int((self.labels["part"] != "train").sum())
        where = (
            f" ({reserved} caem na validação ou depois do corte de {self.split.train_end})"
            if reserved
            else ""
        )
        if len(used) < MIN_FEEDBACK_LABELS:
            return (
                f"Sobram {len(used)} rótulos do retorno nas semanas de treino{where}; o retreino"
                f" com retorno precisa de pelo menos {MIN_FEEDBACK_LABELS}."
            )
        if not launderings or not false_positives:
            missing = "lavagem confirmada" if not launderings else "falso positivo confirmado"
            return f"As semanas de treino não têm nenhum rótulo de {missing}{where}."
        return None

    def missing_ids(self) -> list[int]:
        """Transações cobertas pelo retorno que não têm gabarito: entram no treino com o rótulo
        do analista, e quem treina precisa lê-las à parte (``read_labeled`` só lê as rotuladas)."""
        return self.transactions.loc[~self.transactions["has_truth"], "transaction_id"].tolist()

    def info(self) -> dict:
        part = self.labels["part"]
        return {
            "include_simulated": self.include_simulated,
            "labels_used": _label_breakdown(self.training_labels()),
            "labels_in_validation": int((part == "validation").sum()),
            "labels_reserved_for_test": int((part == "test").sum()),
            "weight": FEEDBACK_WEIGHT,
            "positive_top": FEEDBACK_POSITIVE_TOP,
        }


def plan_feedback(
    labels: pd.DataFrame, truth_weeks: Sequence, include_simulated: bool
) -> FeedbackPlan:
    """A divisão do retreino com retorno (``resolve_feedback_split``) e a parte de cada rótulo:
    ``train`` (semana antes da validação, ganha peso), ``validation`` (sem peso) ou ``test``
    (depois do corte, reservado para medir a versão)."""
    split = resolve_feedback_split(truth_weeks, labels["week"].tolist())
    week = labels["week"]
    part = np.where(
        week > pd.Timestamp(split.train_end),
        "test",
        np.where(week >= pd.Timestamp(split.validation_start), "validation", "train"),
    )
    return FeedbackPlan(
        split=split, labels=labels.assign(part=part), include_simulated=include_simulated
    )


@dataclass
class TrainingData:
    """O que o modelo recebe. Uma posição por transação, em ordem de tempo, igual em todos os
    campos."""

    x: pd.DataFrame  # variáveis (ver features/history.py)
    y: np.ndarray  # 1 = lavagem, 0 = normal, -1 = teste (escondido do modelo) ou sem rótulo
    sender: np.ndarray  # contas, com o CAIXA no outro lado da espécie
    receiver: np.ndarray
    train: np.ndarray  # máscaras da divisão no tempo
    validation: np.ndarray
    test: np.ndarray
    # Retorno dos analistas: o peso de cada linha no treino (None = todas valem 1) e as linhas
    # que só estão no treino porque o retorno as cobre (sem gabarito).
    weight: np.ndarray | None = None
    feedback_only: np.ndarray | None = None

    def without_feedback(self) -> "TrainingData":
        """Os mesmos dados e a mesma divisão, só com o gabarito: sem pesos e sem as linhas que
        só o retorno rotula. É o controle da comparação honesta (``measure_feedback``)."""
        train = self.train if self.feedback_only is None else self.train & ~self.feedback_only
        return replace(self, train=train, weight=None, feedback_only=None)


def build_training_data(
    transactions: pd.DataFrame,
    ground_truth: pd.DataFrame,
    features: pd.DataFrame,
    excluded=EXCLUDED_FEATURES,
    split: Split = OFFICIAL_SPLIT,
    feedback: pd.DataFrame | None = None,
) -> tuple[TrainingData, pd.DataFrame]:
    """Alinha tudo na ordem das variáveis e separa o gabarito, que só a avaliação lê.

    O gabarito volta numa tabela à parte (`truth`), com a semana de cada transação, a tipologia,
    os atalhos do gerador e os grupos para medir viés. `excluded`: variáveis a tirar do modelo.

    `feedback`: o rótulo por transação do retorno dos analistas (``feedback_transactions``, só
    dos rótulos das semanas de treino). O gabarito sempre ganha: a transação coberta que
    concorda com ele pesa ``FEEDBACK_WEIGHT`` no treino; a que discorda fica com o gabarito, peso
    1, e conta como conflito; a que não tem gabarito entra no treino com o rótulo do analista e o
    peso do retorno. Só as linhas de treino ganham peso: validação e teste continuam só com o
    gabarito e sem peso. As contagens vão em ``truth.attrs["feedback"]``.
    """
    ids = features["id"].to_numpy()
    tx = with_cash_account(transactions).set_index("id").loc[ids]
    labels = ground_truth.set_index("transaction_id").reindex(ids)
    has_truth = labels["label"].notna().to_numpy()
    when = tx["occurred_at"]
    until_train_end = (when < pd.Timestamp(split.train_end) + pd.Timedelta(days=1)).to_numpy()
    validation = until_train_end & (when >= split.validation_start).to_numpy()
    train_rows = until_train_end & ~validation
    y = labels["label"].fillna(-1).to_numpy("int8")  # -1: sem gabarito
    weight = feedback_only = None
    stats = None
    if feedback is not None:
        given = feedback.set_index("transaction_id")["label"].reindex(ids)
        covered = given.notna().to_numpy() & train_rows
        analyst = given.fillna(-1).to_numpy("int8")
        agree = covered & has_truth & (analyst == y)
        conflict = covered & has_truth & (analyst != y)
        feedback_only = covered & ~has_truth
        y = np.where(feedback_only, analyst, y).astype("int8")
        weight = np.where(agree | feedback_only, FEEDBACK_WEIGHT, 1.0)
        stats = {
            "transactions_covered": int(covered.sum()),
            "transactions_weighted": int((agree | feedback_only).sum()),
            "transactions_without_truth": int(feedback_only.sum()),
            "conflicts": int(conflict.sum()),
        }
    usable = has_truth if feedback_only is None else has_truth | feedback_only
    data = TrainingData(
        x=features.drop(columns=["id", *excluded]).reset_index(drop=True),
        y=np.where(until_train_end, y, -1).astype("int8"),
        sender=tx["sender"].to_numpy(),
        receiver=tx["receiver"].to_numpy(),
        train=train_rows & usable,
        validation=validation & has_truth,
        test=~until_train_end & has_truth,
        weight=weight,
        feedback_only=feedback_only,
    )
    # Os atalhos são procurados em todas as variáveis, mesmo nas tiradas do modelo: é uma
    # propriedade do dado.
    rules, shortcut = find_shortcuts(features.drop(columns="id"), y, data.train)
    # Contas que já lavaram antes do teste reaparecem nele, como num banco de verdade.
    laundered = until_train_end & (y == 1)
    known = np.union1d(data.sender[laundered], data.receiver[laundered])
    known = np.setdiff1d(known, [CASH_ACCOUNT])
    typology = labels["typology"].astype(object).where(has_truth, "sem_gabarito")
    truth = pd.DataFrame(
        {
            "y": y,
            "typology": typology.astype(str).to_numpy(),
            "week": week_start(when).to_numpy(),
            "shortcut": shortcut,
            "known_account": np.isin(data.sender, known) | np.isin(data.receiver, known),
            "payment_type": tx["payment_type"].astype(str).to_numpy(),
            "sender_country": tx["sender_country"].astype(str).to_numpy(),
            "receiver_country": tx["receiver_country"].astype(str).to_numpy(),
        }
    )
    truth.attrs["shortcuts"] = rules
    truth.attrs["feedback"] = stats
    return data, truth


def train_lightgbm(data: TrainingData) -> lgb.LGBMClassifier:
    """Árvores em sequência, cada uma corrigindo o erro das anteriores.

    Lê as variáveis direto (aceita nulos e categorias) e para quando a validação deixa de
    melhorar.
    """
    model = lgb.LGBMClassifier(**LIGHTGBM_PARAMS, metric="average_precision", verbose=-1)
    # Pesos só nas linhas de treino; a validação (parada e cortes) fica sem peso.
    weight = None if data.weight is None else data.weight[data.train]
    model.fit(
        data.x[data.train],
        data.y[data.train],
        sample_weight=weight,
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


# --- comparação com a versão ativa (trava de promoção) ----------------------------------------


@dataclass
class ActiveModel:
    """A versão que dá as notas do conjunto hoje: o booster, a ficha e o nome mostrado
    (``lightgbm_vN`` ou ``<slug>/vN``)."""

    booster: lgb.Booster
    card: dict
    name: str


SCORING_CHUNK = 500_000  # linhas por vez ao dar nota com a versão ativa (limita a memória)
COMPARISON_METRICS = ("pr_auc", "queue_recall", "queue_precision", "innocents_per_week")


def comparison_rows(truth: pd.DataFrame, data: TrainingData, active: ActiveModel, dataset: str):
    """As linhas da comparação: o teste da versão nova, e só as semanas que a versão ativa também
    não viu no treino. Se a ativa treinou neste conjunto, as semanas até o ``train_end`` dela
    ficam fora; assim as duas versões são medidas fora da amostra, nas mesmas semanas."""
    rows = data.test.copy()
    if (active.card.get("training_dataset") or OFFICIAL_DATASET) == dataset:
        seen_until = np.datetime64(pd.Timestamp(active.card["train_end"]))
        rows &= truth["week"].to_numpy() > seen_until
    return np.flatnonzero(rows)


def score_with(features: pd.DataFrame, rows: np.ndarray, active: ActiveModel) -> np.ndarray:
    """A nota que a versão ativa dá às linhas pedidas de ``features`` (``compute_features``),
    com a ordem das variáveis e as categorias da ficha dela, como o lote do worker."""
    columns = [features.columns.get_loc(c) for c in active.card["features"]]
    scores = np.empty(len(rows), dtype="float64")
    for begin in range(0, len(rows), SCORING_CHUNK):
        chunk = rows[begin : begin + SCORING_CHUNK]
        x, _ = model_input(features.iloc[chunk, columns], active.card)
        scores[begin : begin + len(chunk)] = active.booster.predict(x)
    return scores


def _finite(value) -> float | None:
    value = float(value)
    return value if np.isfinite(value) else None


def period_metrics(
    score: np.ndarray,
    rows: np.ndarray,
    data: TrainingData,
    truth: pd.DataFrame,
    *,
    cut: float,
    size: int,
) -> dict:
    """PR-AUC por transação e a fila por conta na semana (com o corte e o tamanho de fila da
    versão), medidos nas linhas ``rows`` contra o gabarito. ``score`` alinhado com ``rows``."""
    y = truth["y"].to_numpy()[rows]
    if not len(rows) or not (y == 1).any():
        return dict.fromkeys(COMPARISON_METRICS)
    accounts = account_weeks(
        truth["week"].to_numpy()[rows], data.sender[rows], data.receiver[rows], score, y
    )
    recall, precision, per_week = weekly_queue(accounts, size=size, cut=cut)
    return {
        "pr_auc": _finite(average_precision_score(y, score)),
        "queue_recall": _finite(recall),
        "queue_precision": _finite(precision),
        "innocents_per_week": _finite(per_week * (1 - precision)),
    }


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%".replace(".", ",")


def promotion_gate(candidate: dict, active: dict, active_name: str) -> dict:
    """A trava de promoção: a versão nova não pode achar menos lavadoras na fila que a ativa, no
    mesmo período de teste, além de ``PROMOTION_RECALL_TOLERANCE``."""
    new, current = candidate["queue_recall"], active["queue_recall"]
    if new is None or current is None:
        return {
            "passed": False,
            "reason": "Não há lavagem com gabarito no período de teste comum às duas versões; sem"
            " essa medida, a versão nova não pode ser comparada com a ativa.",
        }
    if new >= current - PROMOTION_RECALL_TOLERANCE:
        return {
            "passed": True,
            "reason": f"Acha {_pct(new)} das contas lavadoras na fila, contra {_pct(current)} da"
            f" versão ativa ({active_name}) no mesmo período de teste.",
        }
    gap = f"{(current - new) * 100:.1f}".replace(".", ",")
    limit = f"{PROMOTION_RECALL_TOLERANCE * 100:.0f}"
    return {
        "passed": False,
        "reason": f"Bloqueada: acha {gap} p.p. menos lavadoras na fila que a versão ativa"
        f" ({active_name}) no mesmo período de teste ({_pct(new)} contra {_pct(current)}); o"
        f" limite é {limit} p.p.",
    }


def compare_with_active(
    score: np.ndarray,
    active_score: np.ndarray | None,
    rows: np.ndarray,
    data: TrainingData,
    truth: pd.DataFrame,
    *,
    cut: float,
    active: ActiveModel,
) -> dict:
    """O bloco ``comparison`` da ficha: a versão nova e a ativa medidas nas mesmas semanas, fora
    da amostra das duas, e a trava de promoção."""
    weeks = pd.DatetimeIndex(np.unique(truth["week"].to_numpy()[rows]))
    if not len(rows):
        empty = dict.fromkeys(COMPARISON_METRICS)
        return {
            "active_version": active.name,
            "period": {"start": None, "end": None, "weeks": 0},
            "candidate": empty,
            "active": empty,
            "recall_difference": None,
            "tolerance": PROMOTION_RECALL_TOLERANCE,
            "gate": {
                "passed": False,
                "reason": "Não há semanas com gabarito fora do treino das duas versões para"
                " compará-las.",
            },
        }
    candidate = period_metrics(score[rows], rows, data, truth, cut=cut, size=QUEUE_SIZE)
    current = period_metrics(
        active_score,
        rows,
        data,
        truth,
        cut=float(active.card["queue_cut"]),
        size=int(active.card["queue_size"]),
    )
    difference = (
        None
        if candidate["queue_recall"] is None or current["queue_recall"] is None
        else candidate["queue_recall"] - current["queue_recall"]
    )
    return {
        "active_version": active.name,
        "period": {
            "start": weeks.min().date().isoformat(),
            "end": weeks.max().date().isoformat(),
            "weeks": len(weeks),
        },
        "candidate": candidate,
        "active": current,
        "recall_difference": difference,
        "tolerance": PROMOTION_RECALL_TOLERANCE,
        "gate": promotion_gate(candidate, current, active.name),
    }


def save_model(transactions: pd.DataFrame, ground_truth: pd.DataFrame, folder=None) -> dict:
    """Treina o LightGBM na configuração oficial e grava uma versão nova em `folder`
    (padrão: MODEL_DIR): o modelo (`lightgbm_vN.txt`) e a ficha (`lightgbm_vN.json`), com as
    variáveis, os cortes escolhidos na validação e as métricas no teste. Também copia o modelo
    para MODEL_FILE (`lightgbm_model.txt`), o arquivo que o health da API confere.

    As variáveis são calculadas aqui, com o código atual, e nunca lidas de um arquivo guardado.
    """
    return train_version(transactions, ground_truth, folder, split=OFFICIAL_SPLIT, official=True)


def train_version(
    transactions: pd.DataFrame,
    ground_truth: pd.DataFrame,
    folder=None,
    *,
    split: Split | None = None,
    official: bool = False,
    first_version: int = 1,
    progress: Callable[[int, str], None] | None = None,
    dataset: str = OFFICIAL_DATASET,
    feedback: FeedbackPlan | None = None,
    active: ActiveModel | None = None,
) -> dict:
    """O treino de `save_model` com a divisão e a numeração escolhidas por quem chama.

    `split`: padrão, a de `resolve_split` (a oficial no SAML-D), ou a do retorno. `first_version`:
    a versão nova nunca é menor que ele (um conjunto numera depois do modelo oficial, para o nome
    da versão ser único no banco). `official`: copia o modelo para MODEL_FILE.
    `progress(0..100, texto)` é chamado a cada etapa. `dataset`: o slug do conjunto de onde vêm as
    transações, gravado na ficha (`training_dataset`): o worker só recusa as semanas do treino
    nesse conjunto. O gabarito só treina e mede; o score de cada transação usa só as variáveis.

    `feedback`: o retorno dos analistas (``plan_feedback`` + ``feedback_transactions``); a divisão
    passa a ser a dele e os rótulos pesam no treino (``build_training_data``). `active`: a versão
    ativa do conjunto, medida no mesmo período de teste para a trava de promoção. A ficha ganha
    os blocos ``feedback`` e ``comparison``.
    """
    report = progress or (lambda _percent, _message: None)
    folder = Path(folder or get_settings().model_dir)
    if feedback is not None:
        split = feedback.split
    split = split or resolve_split(transactions)
    report(0, "Calculando as variáveis das transações.")
    features = compute_features(transactions)
    report(25, "Montando a base com a divisão no tempo.")
    data, truth = build_training_data(
        transactions,
        ground_truth,
        features,
        split=split,
        feedback=None if feedback is None else feedback.transactions,
    )
    rows = active_score = None
    if active is not None:
        report(32, f"Dando nota com a versão ativa ({active.name}) no período de teste.")
        rows = comparison_rows(truth, data, active, dataset)
        active_score = score_with(features, rows, active)
    del features
    if not (truth["y"].to_numpy()[data.train] == 1).any():
        raise ValueError("o período de treino não tem nenhuma transação rotulada como lavagem")
    report(40, "Treinando o LightGBM.")
    model = train_lightgbm(data)
    report(65, "Medindo no período de teste.")
    score = model.predict_proba(data.x)[:, 1]
    metrics, by_typology = evaluate(score, data, truth)
    queue = queue_with_cut(score, data, truth, targets=(QUEUE_TARGET,)).iloc[-1]
    y, va, te = truth["y"].to_numpy(), data.validation, data.test
    threshold = recall_at_fpr(y[va], score[va])[1]
    report(80, "Agrupando as contas em segmentos.")
    until = pd.Timestamp(split.train_end) + pd.Timedelta(days=1)
    profiles = account_profile(transactions, until=until)
    report(90, "Gravando a versão do modelo.")
    version = 1 + max(_versions(folder), default=0)
    version = max(version, first_version)
    name = f"lightgbm_v{version}"
    folder.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(folder / f"{name}.txt", num_iteration=model.best_iteration_)
    queue_keys = ["recall", "precision", "f1", "accounts_per_week", "innocents_per_week"]
    used = {"kind": "feedback" if feedback is not None else split_kind(split)}
    feedback_block = (
        {"used": False, "split": used}
        if feedback is None
        else {
            "used": True,
            **feedback.info(),
            **(truth.attrs.get("feedback") or {}),
            "split": used,
        }
    )
    comparison = None
    if active is not None:
        comparison = compare_with_active(
            score, active_score, rows, data, truth, cut=float(queue["cut"]), active=active
        )
    card = {
        "version": version,
        # Com o fuso: a API compara com a data dos rótulos ("novos desde a versão ativa").
        "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "file": f"{name}.txt",
        "features": list(data.x.columns),
        "categories": {c: list(data.x[c].cat.categories) for c in data.x.select_dtypes("category")},
        "excluded_features": list(EXCLUDED_FEATURES),
        "params": LIGHTGBM_PARAMS,
        "trees": int(model.best_iteration_),
        "training_dataset": dataset,
        "history_start": transactions["occurred_at"].min().date().isoformat(),
        "validation_start": split.validation_start,
        "train_end": split.train_end,
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
        "feedback": feedback_block,
        "comparison": comparison,
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
            "training_dataset: o conjunto de dados do treino; só nele o worker recusa as semanas "
            "até train_end (o modelo já viu esses scores)",
            "O CAIXA (conta -1) é o outro lado de todo saque e depósito em espécie e não entra "
            "na fila",
            "Explicação de um alerta: training.explain(booster, x) com a transação de maior "
            "score da conta na semana",
            "segments: K-Means do perfil das 12 semanas antes de train_end; segmento de uma "
            "conta: segments.assign_segments",
            "feedback: o retorno dos analistas usado no treino (docs/analyst-feedback.md); "
            "comparison: a versão ativa medida nas mesmas semanas de teste e a trava de promoção",
        ],
    }
    # UTF-8 explícito: no Windows o padrão é cp1252, e o worker no Docker (Linux) lê em UTF-8.
    (folder / f"{name}.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if official:
        shutil.copyfile(folder / f"{name}.txt", folder / get_settings().model_file)
    return card


# --- efeito do retorno, medido com honestidade -------------------------------------------------

MEASURED = ("pr_auc", "recall_at_fpr", "queue_recall", "queue_precision", "innocents_per_week")


def _measure(model: lgb.LGBMClassifier, data: TrainingData, truth: pd.DataFrame) -> dict:
    """As métricas de teste de um modelo, como na ficha: PR-AUC, recall com 0,13% de falso
    positivo, a fila com o corte escolhido na validação e o recall por tipologia."""
    score = model.predict_proba(data.x)[:, 1]
    metrics, by_typology = evaluate(score, data, truth)
    queue = queue_with_cut(score, data, truth, targets=(QUEUE_TARGET,)).iloc[-1]
    return {
        "trees": int(model.best_iteration_),
        "pr_auc": _finite(metrics["pr_auc"]),
        "recall_at_fpr": _finite(metrics["recall_at_fpr"]),
        "queue_recall": _finite(queue["recall"]),
        "queue_precision": _finite(queue["precision"]),
        "innocents_per_week": _finite(queue["innocents_per_week"]),
        "accounts_per_week": _finite(queue["accounts_per_week"]),
        "queue_cut": _finite(queue["cut"]),
        "recall_by_typology": {k: _finite(v) for k, v in by_typology.round(4).items()},
    }


def measure_feedback(
    transactions: pd.DataFrame,
    ground_truth: pd.DataFrame,
    plan: FeedbackPlan,
    progress: Callable[[int, str], None] | None = None,
) -> dict:
    """O experimento honesto do retorno: dois modelos com a MESMA divisão (a do retorno), o mesmo
    dado e os mesmos parâmetros; o controle só com o gabarito e o tratamento com o gabarito e os
    pesos do retorno. A diferença entre os dois é o efeito do retorno, separado do efeito de
    treinar com semanas mais recentes (que os dois têm). Não grava versão nenhuma.
    """
    report = progress or (lambda _percent, _message: None)
    report(0, "Calculando as variáveis das transações.")
    features = compute_features(transactions)
    report(25, "Montando a base com a divisão do retorno.")
    treatment, truth = build_training_data(
        transactions, ground_truth, features, split=plan.split, feedback=plan.transactions
    )
    del features
    results = {}
    for percent, (name, data) in zip(
        (40, 70), (("control", treatment.without_feedback()), ("treatment", treatment)), strict=True
    ):
        report(
            percent, f"Treinando o modelo {'de controle' if name == 'control' else 'com retorno'}."
        )
        results[name] = _measure(train_lightgbm(data), data, truth)
    control, with_feedback = results["control"], results["treatment"]

    def minus(a, b):
        return None if a is None or b is None else a - b

    typologies = sorted(
        set(control["recall_by_typology"]) | set(with_feedback["recall_by_typology"])
    )
    return {
        "split": {
            "train_end": plan.split.train_end,
            "validation_start": plan.split.validation_start,
        },
        "feedback": {**plan.info(), **(truth.attrs.get("feedback") or {})},
        "control": control,
        "treatment": with_feedback,
        "difference": {
            **{k: minus(with_feedback[k], control[k]) for k in MEASURED},
            "recall_by_typology": {
                k: minus(
                    with_feedback["recall_by_typology"].get(k), control["recall_by_typology"].get(k)
                )
                for k in typologies
            },
        },
    }


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
