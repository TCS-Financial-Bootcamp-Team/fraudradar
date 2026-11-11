"""Carga do SAML-D no Postgres: `transactions`, `ground_truth` e `accounts`, por COPY.

É o único lugar do worker que lê o CSV; o lote lê as transações do Postgres.

- Os ids seguem o CSV: `transactions.id` é a posição da linha + 1 (o `id` de `load_csv` começa
  em 0) e `ground_truth.transaction_id` é o mesmo número. O COPY grava o id explícito mesmo com
  a coluna GENERATED ALWAYS; no fim, a identidade passa do maior id, para o POST /ingestion/* da
  API não colidir.
- `accounts` sai das contas como vieram no CSV (o CAIXA só existe no cálculo das variáveis),
  com a primeira e a última transação de cada uma e sem segmento: o lote preenche o segmento.
- O valor vai para NUMERIC(14,2): os poucos valores do SAML-D com mais de duas casas decimais
  são arredondados para centavos, e a carga conta quantos.
"""

from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
from sqlalchemy import Engine

from fraudradar.data.saml_d import TRANSACTION_COLUMNS, load_csv
from fraudradar.datasets import Dataset, use_dataset
from fraudradar.features.history import CASH_ACCOUNT
from worker import repository
from worker.errors import WorkerError

GROUND_TRUTH_COLUMNS = ["transaction_id", "label", "original_typology", "typology"]


@dataclass
class LoadResult:
    transactions: int  # com already_loaded, as que já estavam no banco
    accounts: int = 0
    rounded_amounts: int = 0
    seconds: float = 0.0
    already_loaded: bool = False


def check_csv(csv_path: Path | str) -> Path:
    path = Path(csv_path)
    if not path.is_file():
        raise WorkerError(
            f"arquivo não encontrado: {path} (baixe o SAML-D pelo Kaggle; veja data/README.md)"
        )
    return path


def load_saml_d(
    engine: Engine, csv_path: Path | str, *, dataset: Dataset | None = None
) -> LoadResult:
    """Carrega o CSV inteiro numa transação só. Se o SAML-D já está no banco, não faz nada."""
    path = check_csv(csv_path)
    with engine.connect() as conn:
        if dataset is not None:
            use_dataset(conn, dataset)
        existing = _existing(conn)
    if existing:
        return LoadResult(transactions=existing, already_loaded=True)

    clock = perf_counter()
    transactions, ground_truth = load_csv(path)
    ids = transactions["id"].to_numpy("int64") + 1
    transactions["id"] = ids
    ground_truth["transaction_id"] = ids
    amount = transactions["amount"].to_numpy()
    rounded = int((np.round(amount, 2) != amount).sum())
    accounts = _accounts(transactions)
    with engine.begin() as conn:
        if dataset is not None:
            use_dataset(conn, dataset)
        repository.lock_worker(conn)
        existing = _existing(conn)  # outra carga pode ter terminado enquanto esta lia o CSV
        if existing:
            return LoadResult(transactions=existing, already_loaded=True)
        repository.copy_frame(conn, "transactions", transactions[TRANSACTION_COLUMNS])
        repository.copy_frame(conn, "ground_truth", ground_truth[GROUND_TRUTH_COLUMNS])
        repository.copy_frame(conn, "accounts", accounts)
        repository.move_identity(conn)
    return LoadResult(
        transactions=len(transactions),
        accounts=len(accounts),
        rounded_amounts=rounded,
        seconds=perf_counter() - clock,
    )


def _existing(conn) -> int:
    """Quantas transações do SAML-D já estão no banco (0 = pode carregar).

    Os ids do SAML-D são 1..N: com transações da API já gravadas e sem o SAML-D, eles
    colidiriam, e a carga é recusada.
    """
    existing = repository.saml_d_count(conn)
    if not existing and repository.has_ingested(conn):
        raise WorkerError(
            "a tabela transactions já tem transações enviadas pela API, e a carga do SAML-D usa"
            " os ids 1..N do CSV: carregue o SAML-D num banco vazio (docker compose down -v e"
            " docker compose up -d db) e envie os arquivos depois"
        )
    return existing


def _accounts(transactions: pd.DataFrame) -> pd.DataFrame:
    """Uma linha por conta como veio no CSV (nunca o CAIXA), com a primeira e a última vez."""
    both = pd.concat(
        [
            transactions[["sender", "occurred_at"]].rename(columns={"sender": "account"}),
            transactions[["receiver", "occurred_at"]].rename(columns={"receiver": "account"}),
        ],
        ignore_index=True,
    )
    both = both[both["account"] != CASH_ACCOUNT]
    seen = both.groupby("account")["occurred_at"].agg(first_seen_at="min", last_seen_at="max")
    return seen.reset_index()
