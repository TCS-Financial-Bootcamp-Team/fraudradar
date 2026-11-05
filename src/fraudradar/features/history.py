"""Variáveis de cada transação, calculadas só com o passado das contas.

Regra que não muda: a variável de uma transação só usa transações com horário ANTERIOR ao dela
(nem as do mesmo segundo entram). Por isso calcular tudo de uma vez dá o mesmo resultado que
calcular semana a semana; o teste `test_no_future` confere isso cortando o dado numa data.

O CAIXA: saque e depósito em espécie não têm conta do outro lado. No SAML-D, esse lado é uma
conta inventada nas transações normais (que não aparece em mais nada) e uma conta real nas de
lavagem. Sem tratar, o modelo acertaria só olhando se a conta do outro lado tem outras
transações; isso entregava a resposta em 28% das lavagens. Por isso, aqui, o outro lado de todo
saque e depósito vira uma conta única, o CAIXA: o histórico desse lado fica vazio e ele não
entra na fila. O banco guarda as contas como vieram; o CAIXA só existe no cálculo.
"""

import numpy as np
import pandas as pd

CASH_ACCOUNT = -1  # o CAIXA
DAY = 86_400  # segundos
CASH_PAYMENT_TYPES = ["Cash Deposit", "Cash Withdrawal"]
CATEGORICAL = ["payment_type", "sender_country", "receiver_country"]
COUNTRY_FEATURES = ["sender_country", "receiver_country", "cross_border", "currency_mismatch"]
# Histórico de cada lado. Ficam vazios quando esse lado é o CAIXA.
SENDER_HISTORY = [
    "sender_sent_count",
    "sender_mean_amount",
    "sender_amount_ratio",
    "sender_days_since_last",
    "sender_sent_count_7d",
    "sender_sent_amount_7d",
    "sender_distinct_receivers",
    "sender_new_counterparty_share_7d",
    "sender_received_amount_7d",
    "sender_received_count_7d",
    "sender_out_in_ratio_7d",
]
RECEIVER_HISTORY = [
    "receiver_received_count",
    "receiver_distinct_senders",
    "receiver_new_senders_7d",
    "receiver_days_since_last",
    "receiver_received_count_7d",
    "receiver_received_amount_7d",
    "receiver_sent_amount_7d",
]


def with_cash_account(transactions: pd.DataFrame) -> pd.DataFrame:
    """Cópia das transações com o CAIXA no outro lado de todo depósito e saque em espécie."""
    tx = transactions.copy()
    tx.loc[(tx["payment_type"] == "Cash Deposit").to_numpy(), "sender"] = CASH_ACCOUNT
    tx.loc[(tx["payment_type"] == "Cash Withdrawal").to_numpy(), "receiver"] = CASH_ACCOUNT
    return tx


def week_start(dates: pd.Series) -> pd.Series:
    """A segunda-feira que abre a semana de cada data (no glossário, semana é sempre a segunda)."""
    return dates.dt.to_period("W-SUN").dt.start_time


class _Past:
    """Transações de cada conta em ordem de tempo, para somar o que houve ANTES de um horário."""

    def __init__(self, account: np.ndarray, t: np.ndarray):
        self.order = np.lexsort((t, account))
        self.t = t[self.order]
        self.key = account[self.order] * 2**32 + self.t  # (conta, tempo) numa chave só, ordenada

    def window(self, account, t, days=None):
        """Posições [início, fim) das transações da conta com horário em [t - days, t).

        Sem `days`, todo o passado.
        """
        base = account * 2**32
        end = np.searchsorted(self.key, base + t, side="left")
        start = base if days is None else base + np.maximum(t - days * DAY, 0)
        return np.searchsorted(self.key, start, side="left"), end

    def total(self, values, window):
        cumulative = np.concatenate([[0.0], np.cumsum(values[self.order], dtype="float64")])
        start, end = window
        return cumulative[end] - cumulative[start]

    def days_since_last(self, t, window):
        start, end = window
        return np.where(end > start, (t - self.t[np.maximum(end - 1, 0)]) / DAY, np.nan)


def _ratio(a, b):
    """a / b, com nulo onde b é zero (ex.: conta sem histórico)."""
    return np.divide(a, b, out=np.full(len(a), np.nan), where=b > 0)


def _differs(a: pd.Series, b: pd.Series) -> np.ndarray:
    return a.astype(str).to_numpy() != b.astype(str).to_numpy()


def compute_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por transação (coluna `id`), em ordem de tempo, com as variáveis do modelo.

    Recebe as colunas de `transactions` (as do banco). O CAIXA é aplicado aqui. Os nulos são
    reais: a primeira transação de uma conta não tem média nem "dias desde a última".
    """
    tx = with_cash_account(transactions)
    tx = tx.sort_values(["occurred_at", "id"], kind="stable", ignore_index=True)
    n = len(tx)
    t = tx["occurred_at"].to_numpy("datetime64[s]").astype("int64")
    codes = pd.factorize(np.concatenate([tx["sender"].to_numpy(), tx["receiver"].to_numpy()]))[0]
    sender, receiver = codes[:n], codes[n:]
    amount = tx["amount"].to_numpy("float64")
    one = np.ones(n)
    # 1ª transação do par na ordem do dado: conta contrapartes distintas
    first_of_pair = (~tx.duplicated(["sender", "receiver"])).to_numpy("float64")
    # o par não tem transação com horário ANTERIOR (no mesmo segundo da 1ª, todas são novas)
    pair_start = tx.groupby(["sender", "receiver"], sort=False)["occurred_at"].transform("min")
    new_counterparty = (tx["occurred_at"] == pair_start).to_numpy("float64")

    sent = _Past(sender, t)  # o que cada conta enviou
    received = _Past(receiver, t)  # o que cada conta recebeu
    sender_all, sender_7d = sent.window(sender, t), sent.window(sender, t, 7)
    sender_in_7d = received.window(sender, t, 7)  # o que a conta que envia recebeu na semana
    receiver_all, receiver_7d = received.window(receiver, t), received.window(receiver, t, 7)
    receiver_out_7d = sent.window(receiver, t, 7)  # o que a conta que recebe enviou na semana

    sender_count = sent.total(one, sender_all)
    sender_mean = _ratio(sent.total(amount, sender_all), sender_count)
    sender_count_7d = sent.total(one, sender_7d)
    sender_amount_7d = sent.total(amount, sender_7d)
    sender_received_7d = received.total(amount, sender_in_7d)

    f = pd.DataFrame(
        {
            "id": tx["id"].to_numpy(),
            # a própria transação
            "amount": amount,
            "hour": tx["occurred_at"].dt.hour.to_numpy(),
            "payment_type": tx["payment_type"].astype("category"),
            "sender_country": tx["sender_country"].astype("category"),
            "receiver_country": tx["receiver_country"].astype("category"),
            "cross_border": _differs(tx["sender_country"], tx["receiver_country"]),
            "currency_mismatch": _differs(tx["payment_currency"], tx["received_currency"]),
            # passado de quem envia
            "sender_sent_count": sender_count,
            "sender_mean_amount": sender_mean,
            "sender_amount_ratio": _ratio(amount, sender_mean),
            "sender_days_since_last": sent.days_since_last(t, sender_all),
            "sender_sent_count_7d": sender_count_7d,
            "sender_sent_amount_7d": sender_amount_7d,
            "sender_distinct_receivers": sent.total(first_of_pair, sender_all),
            "new_counterparty": new_counterparty,
            # contrapartes novas frente ao histórico da semana
            "sender_new_counterparty_share_7d": _ratio(
                sent.total(first_of_pair, sender_7d), sender_count_7d
            ),
            "sender_received_amount_7d": sender_received_7d,
            "sender_received_count_7d": received.total(one, sender_in_7d),
            # passagem rápida: o que sai, com esta transação, frente ao que entrou na semana
            "sender_out_in_ratio_7d": _ratio(sender_amount_7d + amount, sender_received_7d),
            # passado de quem recebe
            "receiver_received_count": received.total(one, receiver_all),
            "receiver_distinct_senders": received.total(first_of_pair, receiver_all),
            "receiver_new_senders_7d": received.total(first_of_pair, receiver_7d),
            "receiver_days_since_last": received.days_since_last(t, receiver_all),
            "receiver_received_count_7d": received.total(one, receiver_7d),
            "receiver_received_amount_7d": received.total(amount, receiver_7d),
            "receiver_sent_amount_7d": sent.total(amount, receiver_out_7d),
        }
    )
    f.loc[tx["sender"].to_numpy() == CASH_ACCOUNT, SENDER_HISTORY] = np.nan
    f.loc[tx["receiver"].to_numpy() == CASH_ACCOUNT, RECEIVER_HISTORY] = np.nan
    numeric = f.columns.difference(["id", *CATEGORICAL])
    f[numeric] = f[numeric].astype("float32")
    return f


def account_profile(transactions: pd.DataFrame, until, weeks: int = 12) -> pd.DataFrame:
    """Como cada conta usou o banco nas `weeks` semanas antes de `until`: uma linha por conta,
    para os segmentos (K-Means).

    Só comportamento, sem país: quantas transações, valor médio, quantas contrapartes e que
    fração é espécie ou transferência internacional. A janela é fixa para o perfil não crescer
    só porque o histórico ficou mais longo. O CAIXA fica de fora.
    """
    end = pd.Timestamp(until)
    when = transactions["occurred_at"]
    tx = with_cash_account(transactions[(when >= end - pd.Timedelta(weeks=weeks)) & (when < end)])
    payment = tx["payment_type"].astype(str)
    tx = tx.assign(cash=payment.isin(CASH_PAYMENT_TYPES), cross_border=payment.eq("Cross-border"))
    sent, received = tx.groupby("sender"), tx.groupby("receiver")
    p = pd.DataFrame(
        {
            "sent_count": sent.size(),
            "received_count": received.size(),
            "mean_sent_amount": sent["amount"].mean(),
            "mean_received_amount": received["amount"].mean(),
            "distinct_receivers": sent["receiver"].nunique(),
            "distinct_senders": received["sender"].nunique(),
        }
    ).fillna(0)
    total = p["sent_count"] + p["received_count"]
    p["cash_share"] = sent["cash"].sum().add(received["cash"].sum(), fill_value=0) / total
    p["cross_border_share"] = (
        sent["cross_border"].sum().add(received["cross_border"].sum(), fill_value=0) / total
    )
    return p.drop(index=CASH_ACCOUNT, errors="ignore").rename_axis("account")
