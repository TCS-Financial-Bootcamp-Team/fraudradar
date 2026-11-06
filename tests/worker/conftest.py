"""Fixtures dos testes do worker: o SAML-D sintético num CSV, um modelo pequeno treinado nele e
o banco carregado pelo próprio `worker load`. Precisam do grupo `ml` e do Postgres de teste
(`db`, em tests/conftest.py)."""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fake_saml_d import synthetic
from sqlalchemy import Engine
from worker_helpers import FIRST_WEEK, write_saml_d_csv


@pytest.fixture(scope="session")
def saml_d() -> tuple[pd.DataFrame, pd.DataFrame]:
    return synthetic()


@pytest.fixture(scope="session")
def saml_d_csv(saml_d, tmp_path_factory) -> Path:
    return write_saml_d_csv(*saml_d, tmp_path_factory.mktemp("saml_d") / "SAML-D.csv")


@pytest.fixture(scope="session")
def model_dir(saml_d, tmp_path_factory) -> Path:
    """A ficha de `save_model` no dado sintético, com um booster mais solto no lugar do oficial.

    Com 4 mil transações, o LightGBM oficial (mínimo de 1.000 por folha) não tem como dividir e
    dá o mesmo score a todas: as contribuições ficariam zeradas e o teste "mesmos scores do
    modelo" passaria até com o histórico errado. Por isso o booster é trocado por um de árvores
    pequenas, treinado nas mesmas variáveis só com o período de treino; o resto da ficha
    (variáveis, categorias, history_start, train_end, segmentos, métricas) é o de save_model.

    O corte e o tamanho da fila são escolhidos para os dois valerem na primeira semana de teste:
    há contas abaixo do corte e mais contas acima do corte do que cabem na fila.
    """
    import lightgbm as lgb

    from fraudradar.features.history import compute_features, week_start, with_cash_account
    from fraudradar.model import TRAIN_END
    from fraudradar.model.evaluation import account_weeks
    from fraudradar.model.training import save_model

    transactions, ground_truth = saml_d
    folder = tmp_path_factory.mktemp("model")
    card = save_model(transactions, ground_truth, folder=folder)
    features = compute_features(transactions)
    x = features[card["features"]]
    tx = transactions.set_index("id").loc[features["id"]].reset_index()
    y = ground_truth.set_index("transaction_id").loc[features["id"], "label"].to_numpy()
    seen = (tx["occurred_at"] < pd.Timestamp(TRAIN_END) + pd.Timedelta(days=1)).to_numpy()
    model = lgb.LGBMClassifier(
        n_estimators=60, num_leaves=8, min_child_samples=5, random_state=0, verbose=-1
    )
    model.fit(x[seen], y[seen])
    model.booster_.save_model(folder / card["file"])

    score = model.booster_.predict(x)
    cash = with_cash_account(tx)
    weeks = week_start(tx["occurred_at"]).to_numpy()
    first = account_weeks(
        weeks, cash["sender"].to_numpy(), cash["receiver"].to_numpy(), score, y
    ).xs(pd.Timestamp(FIRST_WEEK), level="week")
    ranked = np.sort(first["score"].unique())[::-1]
    # o corte cai no maior intervalo entre scores vizinhos do miolo da lista: nenhum score fica
    # perto dele, nem depois de virar float32 no banco
    middle = range(len(ranked) // 4, len(ranked) // 2)
    k = max(middle, key=lambda i: ranked[i - 1] - ranked[i])
    card["queue_cut"] = float((ranked[k - 1] + ranked[k]) / 2)
    above = int((first["score"] >= card["queue_cut"]).sum())
    card["queue_size"] = above - 3
    assert card["queue_size"] >= 5, "a fila de teste ficou pequena demais"
    (folder / f"lightgbm_v{card['version']}.json").write_text(
        json.dumps(card, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return folder


@pytest.fixture(scope="session")
def card(model_dir) -> dict:
    return json.loads((model_dir / "lightgbm_v1.json").read_text(encoding="utf-8"))


@pytest.fixture
def loaded(db, saml_d_csv) -> Engine:
    """O banco de teste com o SAML-D sintético carregado pelo `worker load`."""
    from worker.load import load_saml_d

    load_saml_d(db, saml_d_csv)
    return db


@pytest.fixture
def no_rules(tmp_path) -> Path:
    """Pasta de regras vazia, como a db/rules/ de hoje, sem depender dela."""
    folder = tmp_path / "rules"
    folder.mkdir()
    return folder
