"""Amostra de controle: contas sorteadas fora da fila, para medir o que o modelo deixa passar.

O sorteio não olha a nota, repete as mesmas contas para o mesmo conjunto e semana, desliga com 0
e nunca conta como alerta: fica fora das contas suspeitas, das contagens do monitoramento e das
métricas do worker. No recálculo do período aberto, a conta decidida fica como está.
"""

from datetime import timedelta

import numpy as np
import pandas as pd
import pytest

pytest.importorskip("lightgbm")

from worker_helpers import FIRST_WEEK, execute, rows, scalar  # noqa: E402

from fraudradar.datasets import create_dataset, use_dataset  # noqa: E402
from worker.batch import run_batch, run_continuous  # noqa: E402
from worker.load import load_saml_d  # noqa: E402
from worker.queue import exploration_seed, select_exploration  # noqa: E402
from worker.repository import DEFAULT_EXPLORATION_PER_WEEK  # noqa: E402

SIGNALS = {
    "sent_count",
    "received_count",
    "sent_amount",
    "received_amount",
    "distinct_counterparties",
    "cash_share",
    "cross_border_share",
}


@pytest.fixture
def batch(loaded, model_dir, no_rules):
    def run(week=FIRST_WEEK, **options):
        return run_batch(loaded, week, model_dir=model_dir, rules_dir=no_rules, **options)

    return run


def _set_size(engine, size: int, dataset: str = "saml-d") -> None:
    execute(
        engine,
        "UPDATE public.processing_settings SET exploration_per_week = :size WHERE dataset = :d",
        size=size,
        d=dataset,
    )


def _by_origin(engine, origin: str, week=FIRST_WEEK) -> list[dict]:
    return rows(
        engine,
        "SELECT a.id, a.account, a.score, a.queue_position, a.status, a.origin, a.model_version,"
        " a.total_amount, a.transaction_count, e.contributions, e.weekly_signals"
        " FROM alerts a LEFT JOIN evidence e ON e.alert_id = a.id"
        " WHERE a.week = :week AND a.origin = :origin ORDER BY a.queue_position",
        week=week,
        origin=origin,
    )


# --- o sorteio, sem banco ---------------------------------------------------------------------


def _accounts(count: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(7)
    return pd.DataFrame(
        {"score": rng.random(count), "row": np.arange(count)},
        index=pd.Index(np.arange(1000, 1000 + count), name="account"),
    )


def test_draw_takes_accounts_outside_the_queue_and_numbers_them_after_it():
    accounts = _accounts()
    queue = accounts.sort_values("score", ascending=False).head(30).index
    sample = select_exploration(accounts, queue, 5, seed=42, first_position=31)

    assert len(sample) == 5 and sample["account"].is_unique
    assert not set(sample["account"]) & set(queue)
    assert sample["queue_position"].tolist() == [31, 32, 33, 34, 35]
    assert sample["score"].tolist() == sorted(sample["score"], reverse=True)
    # a nota e a transação de maior nota são as da própria conta
    for item in sample.itertuples():
        assert (item.score, item.row) == tuple(accounts.loc[item.account, ["score", "row"]])


def test_draw_is_deterministic_for_the_dataset_and_the_week():
    accounts = _accounts()
    queue = accounts.index[:30]
    seed = exploration_seed("saml-d", FIRST_WEEK)
    first = select_exploration(accounts, queue, 5, seed, 31)["account"].tolist()

    assert select_exploration(accounts, queue, 5, seed, 31)["account"].tolist() == first
    assert exploration_seed("saml-d", FIRST_WEEK) == seed
    other_week = exploration_seed("saml-d", FIRST_WEEK + timedelta(weeks=1))
    other_dataset = exploration_seed("banco-teste", FIRST_WEEK)
    assert len({seed, other_week, other_dataset}) == 3
    assert select_exploration(accounts, queue, 5, other_week, 31)["account"].tolist() != first
    assert select_exploration(accounts, queue, 5, other_dataset, 31)["account"].tolist() != first


def test_draw_ignores_the_score():
    """Cada conta fora da fila tem a mesma chance: somando muitas semanas, as contas de nota
    alta e as de nota baixa são sorteadas na mesma proporção."""
    accounts = _accounts(400)
    low = set(accounts.sort_values("score").head(200).index)
    picked = []
    for i in range(1000):
        seed = exploration_seed("saml-d", FIRST_WEEK + timedelta(weeks=i))
        picked += select_exploration(accounts, [], 10, seed, 1)["account"].tolist()
    share_low = sum(account in low for account in picked) / len(picked)
    assert 0.47 < share_low < 0.53
    # 25 sorteios esperados por conta: nenhuma fica de fora e nenhuma sai demais
    counts = pd.Series(picked).value_counts()
    assert len(counts) == 400
    assert counts.min() >= 8 and counts.max() <= 50


def test_draw_survives_new_accounts_and_accounts_that_move_into_the_queue():
    """O recálculo do período aberto muda as contas ativas: a amostra só troca a conta que
    entrou na fila, e uma conta nova só entra se o número de sorteio dela for menor."""
    accounts = _accounts()
    seed = exploration_seed("saml-d", FIRST_WEEK)
    before = select_exploration(accounts, [], 5, seed, 1)["account"].tolist()

    newcomers = pd.DataFrame(
        {"score": 0.1, "row": 0}, index=pd.Index(range(5000, 5010), name="account")
    )
    after = select_exploration(pd.concat([accounts, newcomers]), [], 5, seed, 1)
    assert len(set(before) & set(after["account"])) >= 4

    moved = before[0]
    without = select_exploration(accounts, [moved], 5, seed, 1)["account"].tolist()
    assert moved not in without and set(before) - {moved} <= set(without)


def test_draw_with_zero_or_too_few_accounts():
    accounts = _accounts(8)
    assert select_exploration(accounts, [], 0, seed=1, first_position=1).empty
    assert len(select_exploration(accounts, accounts.index[:6], 5, seed=1, first_position=7)) == 2
    assert select_exploration(accounts, accounts.index, 5, seed=1, first_position=9).empty


# --- o lote ------------------------------------------------------------------------------------


def test_batch_adds_the_control_sample_after_the_queue(batch, loaded, card):
    [week] = batch().processed
    queue = _by_origin(loaded, "model")
    sample = _by_origin(loaded, "exploration")

    assert week.alerts == len(queue) == card["queue_size"]
    assert week.exploration == len(sample) == DEFAULT_EXPLORATION_PER_WEEK
    assert not {a["account"] for a in sample} & {a["account"] for a in queue}
    # ninguém da amostra tem nota para estar na fila, e a posição continua depois dela
    assert max(a["score"] for a in sample) <= min(a["score"] for a in queue)
    positions = [a["queue_position"] for a in sample]
    assert positions == list(range(len(queue) + 1, len(queue) + len(sample) + 1))
    assert [a["score"] for a in sample] == sorted((a["score"] for a in sample), reverse=True)
    for a in sample:
        # evidência igual à de qualquer alerta: todas as variáveis do modelo e os sinais da semana
        assert a["status"] == "new" and a["model_version"] == "lightgbm_v1"
        assert set(a["contributions"]) == set(card["features"])
        assert set(a["weekly_signals"]) == SIGNALS
        assert a["transaction_count"] > 0
    audit = scalar(loaded, "SELECT details FROM audit_log")
    assert (audit["alerts"], audit["exploration_alerts"]) == (len(queue), len(sample))


def test_reprocessing_draws_the_same_accounts(batch, loaded):
    batch()
    first = _by_origin(loaded, "exploration")
    batch(force=True)
    again = _by_origin(loaded, "exploration")
    assert [a["account"] for a in again] == [a["account"] for a in first]
    assert {a["id"] for a in again}.isdisjoint({a["id"] for a in first})  # gravou de novo


def test_each_week_and_each_dataset_draws_its_own_sample(
    db, saml_d_csv, model_dir, no_rules, batch
):
    with db.begin() as conn:
        other = create_dataset(conn, name="Outro banco", slug="outro-banco")
    load_saml_d(db, saml_d_csv, dataset=other)
    options = {"model_dir": model_dir, "rules_dir": no_rules}
    batch()
    batch(FIRST_WEEK + timedelta(weeks=1))
    # O outro conjunto usa o modelo oficial, que nunca viu os dados dele: sem trava de treino.
    run_batch(db, FIRST_WEEK, dataset=other, **options)

    here = [a["account"] for a in _by_origin(db, "exploration")]
    next_week = [
        a["account"] for a in _by_origin(db, "exploration", FIRST_WEEK + timedelta(weeks=1))
    ]
    with db.connect() as conn:
        use_dataset(conn, other)
        there = [
            row.account
            for row in conn.exec_driver_sql(
                "SELECT account FROM alerts WHERE origin = 'exploration' ORDER BY queue_position"
            )
        ]
    assert len(here) == len(next_week) == len(there) == DEFAULT_EXPLORATION_PER_WEEK
    assert here != next_week
    assert here != there  # mesmas transações, outra semente


def test_zero_turns_the_control_sample_off(batch, loaded, card):
    _set_size(loaded, 0)
    [week] = batch().processed
    assert (week.alerts, week.exploration) == (card["queue_size"], 0)
    assert scalar(loaded, "SELECT count(*) FROM alerts WHERE origin = 'exploration'") == 0
    assert scalar(loaded, "SELECT details ->> 'exploration_alerts' FROM audit_log") == "0"


def test_the_size_comes_from_the_processing_settings(batch, loaded):
    _set_size(loaded, 2)
    [week] = batch().processed
    assert week.exploration == 2
    # sem linha de configuração (conjunto antigo), vale o padrão da coluna
    execute(loaded, "DELETE FROM public.processing_settings")
    [again] = batch(force=True).processed
    assert again.exploration == DEFAULT_EXPLORATION_PER_WEEK


def test_control_sample_stays_out_of_the_worker_metrics(batch, loaded):
    """As métricas contra o gabarito medem a fila do modelo: com a amostra ligada ou desligada,
    saem iguais."""
    batch()
    with_sample = scalar(loaded, "SELECT metrics FROM weekly_batches")
    assert scalar(loaded, "SELECT count(*) FROM alerts WHERE origin = 'exploration'") > 0
    _set_size(loaded, 0)
    batch(force=True)
    assert scalar(loaded, "SELECT metrics FROM weekly_batches") == with_sample
    assert with_sample["queue_size"] == scalar(
        loaded, "SELECT count(*) FROM alerts WHERE origin = 'model'"
    )


def test_control_sample_is_not_an_alert_for_the_api(batch, loaded, client):
    [week] = batch().processed
    params = {"week": FIRST_WEEK.isoformat()}
    sample = {str(a["account"]) for a in _by_origin(loaded, "exploration")}
    queue = {str(a["account"]) for a in _by_origin(loaded, "model")}

    suspicious = client.get("/accounts/suspicious", params={"size": 100}).json()
    assert suspicious["total"] == week.alerts
    assert {item["account"] for item in suspicious["items"]} == queue

    monitoring = client.get("/monitoring", params=params).json()
    assert monitoring["indicators"]["alerts"] == week.alerts
    assert monitoring["indicators"]["alert_rate"] == pytest.approx(
        week.alerts / week.active_accounts
    )
    assert monitoring["weeks"][-1]["value"] == week.alerts
    assert sum(s["value"] for s in monitoring["score_histogram"]) == week.alerts
    assert monitoring["status_counts"]["pending"] == week.alerts
    assert client.get("/weeks").json()["items"] == [
        {"week": FIRST_WEEK.isoformat(), "alerts": week.alerts, "pending": week.alerts}
    ]

    # Na fila da semana a amostra aparece, marcada e no fim; o filtro separa as duas.
    listed = client.get("/alerts", params={**params, "size": 100}).json()
    assert listed["total"] == week.alerts + week.exploration
    tail = listed["items"][-week.exploration :]
    assert {a["origin"] for a in tail} == {"exploration"}
    assert {a["account"] for a in tail} == sample
    only = client.get("/alerts", params={**params, "origin": "exploration"}).json()
    assert only["total"] == week.exploration
    assert {a["account"] for a in only["items"]} == sample


def test_open_week_recompute_keeps_decided_control_accounts(loaded, model_dir, no_rules, client):
    options = {"model_dir": model_dir, "rules_dir": no_rules}
    assert run_continuous(loaded, **options).processed
    open_week = scalar(loaded, "SELECT max(week) FROM weekly_batches")
    sample = _by_origin(loaded, "exploration", open_week)
    assert len(sample) == DEFAULT_EXPLORATION_PER_WEEK
    decided, undecided = sample[0], sample[1:]
    response = client.post(
        f"/alerts/{decided['id']}/decision",
        json={
            "decision": "archive",
            "archive_reason": "false_positive",
            "justification": "Conta da amostra de controle sem indício de lavagem.",
        },
    )
    assert response.status_code == 200
    execute(
        loaded,
        "INSERT INTO transactions (occurred_at, sender, receiver, amount, payment_currency,"
        " received_currency, sender_country, receiver_country, payment_type)"
        " SELECT date_trunc('week', max(occurred_at)) + interval '6 days',"
        " max(sender), max(receiver), max(amount), max(payment_currency),"
        " max(received_currency), max(sender_country), max(receiver_country), max(payment_type)"
        " FROM transactions",
    )

    again = run_continuous(loaded, **options)

    assert [week.week for week in again.processed] == [open_week]
    after = {a["account"]: a for a in _by_origin(loaded, "exploration", open_week)}
    kept = after[decided["account"]]
    # a conta decidida continua a mesma linha: status, origem e o rótulo que a decisão deixou
    assert (kept["id"], kept["status"]) == (decided["id"], "archived")
    assert kept["origin"] == "exploration"
    assert rows(loaded, "SELECT alert_id, label, origin FROM analyst_labels") == [
        {"alert_id": decided["id"], "label": 0, "origin": "exploration"}
    ]
    # as contas sem decisão foram sorteadas de novo: mesmas contas, linhas novas
    assert set(after) == {a["account"] for a in sample}
    assert {after[a["account"]]["id"] for a in undecided}.isdisjoint({a["id"] for a in undecided})
    assert scalar(
        loaded, "SELECT count(*) FROM alerts WHERE week = :w AND account = :a", w=open_week,
        a=decided["account"],
    ) == 1  # fmt: skip
