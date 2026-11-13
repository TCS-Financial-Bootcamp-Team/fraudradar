"""Retorno dos analistas: da decisão sobre o alerta ao rótulo guardado em ``analyst_labels``.

O analista decide por conta e semana (o alerta). Só a decisão conclusiva vira rótulo, e o rótulo
fica numa tabela própria, nunca em ``ground_truth``:

- comunicar (``report``) = lavagem confirmada, rótulo 1;
- arquivar como falso positivo confirmado (``false_positive``) = rótulo 0;
- arquivar sem evidência suficiente (``insufficient_evidence``) e aprofundar (``escalate``) não
  deixam rótulo: arquivar por falta de prova ou de tempo não diz que a conta é inocente.

Vale a última decisão do alerta: uma decisão nova troca ou apaga o rótulo. A API grava o rótulo na
mesma transação da decisão, e o analista simulado (``python -m worker simulate-analyst``) usa a
mesma função, com ``source = 'simulated'``. O porquê de cada regra está em
docs/analyst-feedback.md.

O retreino com retorno (``POST /datasets/{slug}/train`` com ``use_feedback``) só usa rótulos de
períodos FECHADOS: o período aberto ainda muda, e o alerta dele pode ser substituído no próximo
processamento. ``feedback_block_reason`` é a regra de quando há retorno suficiente; a API a usa
para recusar o pedido e o worker a confere de novo antes de treinar.

Sem LightGBM: a imagem da API importa este módulo.
"""

from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import Connection, text

from fraudradar.messages import Msg, msg
from fraudradar.model import MIN_FEEDBACK_LABELS

ARCHIVE_REASONS = ("false_positive", "insufficient_evidence")
LAUNDERING = 1  # lavagem confirmada
FALSE_POSITIVE = 0  # falso positivo confirmado
ANALYST = "analyst"  # decisão de uma pessoa
SIMULATED = "simulated"  # decisão do analista simulado (demonstração)
SOURCES = (ANALYST, SIMULATED)


def decision_label(decision: str, archive_reason: str | None) -> int | None:
    """O rótulo que a decisão deixa, ou ``None`` quando ela não ensina nada ao modelo."""
    if decision == "report":
        return LAUNDERING
    if decision == "archive" and archive_reason == "false_positive":
        return FALSE_POSITIVE
    return None


def store_label(
    conn: Connection, alert_id: int, decision_id: int, label: int | None, source: str = ANALYST
) -> None:
    """Deixa em ``analyst_labels`` o rótulo da decisão mais recente do alerta.

    Com rótulo, grava (ou troca) a linha do alerta, copiando conta, semana e origem dele. Sem
    rótulo, apaga a linha: a decisão anterior deixou de valer. Roda na transação de quem chama,
    a mesma que gravou a decisão.
    """
    if label is None:
        conn.execute(
            text("DELETE FROM analyst_labels WHERE alert_id = :alert"), {"alert": alert_id}
        )
        return
    conn.execute(
        text(
            """
            INSERT INTO analyst_labels (alert_id, decision_id, account, week, label, origin, source)
            SELECT a.id, :decision, a.account, a.week, :label, a.origin, :source
            FROM alerts a WHERE a.id = :alert
            ON CONFLICT (alert_id) DO UPDATE SET
                decision_id = EXCLUDED.decision_id,
                label = EXCLUDED.label,
                origin = EXCLUDED.origin,
                source = EXCLUDED.source,
                updated_at = now()
            """
        ),
        {"alert": alert_id, "decision": decision_id, "label": label, "source": source},
    )


# --- quanto retorno há para o retreino --------------------------------------------------------


@dataclass
class LabelCounts:
    """Rótulos de períodos fechados por fonte da decisão: ``{fonte: [falso positivo, lavagem]}``."""

    by_source: dict[str, list[int]] = field(
        default_factory=lambda: {source: [0, 0] for source in SOURCES}
    )

    def laundering(self, source: str) -> int:
        return self.by_source[source][LAUNDERING]

    def false_positive(self, source: str) -> int:
        return self.by_source[source][FALSE_POSITIVE]

    def usable(self, include_simulated: bool) -> tuple[int, int]:
        """(falsos positivos confirmados, lavagens confirmadas) que o retreino pode usar."""
        sources = SOURCES if include_simulated else (ANALYST,)
        return (
            sum(self.false_positive(s) for s in sources),
            sum(self.laundering(s) for s in sources),
        )


def open_week(conn: Connection) -> date | None:
    """O período aberto do conjunto em uso: a semana da transação mais recente (``None`` sem
    transações). É o mesmo critério do worker (``run_continuous``)."""
    return conn.execute(
        text("SELECT CAST(date_trunc('week', max(occurred_at)) AS date) FROM transactions")
    ).scalar()


def closed_label_counts(conn: Connection, before: date | None = None) -> LabelCounts:
    """Rótulos das semanas fechadas do conjunto em uso (as anteriores a ``before``, por padrão
    o período aberto), por fonte e classe. Lê ``analyst_labels``; nunca ``ground_truth``."""
    if before is None:
        before = open_week(conn)
    counts = LabelCounts()
    if before is None:
        return counts
    rows = conn.execute(
        text(
            "SELECT source, label, count(*) AS n FROM analyst_labels"
            " WHERE week < :before GROUP BY source, label"
        ),
        {"before": before},
    )
    for row in rows:
        counts.by_source[row.source][int(row.label)] = int(row.n)
    return counts


def feedback_block_message(counts: LabelCounts, include_simulated: bool) -> Msg | None:
    """Por que o retreino com o retorno dos analistas não pode rodar (texto em português, código
    e parâmetros); ``None`` quando pode.

    Precisa de pelo menos ``MIN_FEEDBACK_LABELS`` rótulos de períodos fechados e de rótulos das
    duas classes: só falsos positivos (ou só lavagens) puxariam o modelo para um lado só.
    """
    false_positives, launderings = counts.usable(include_simulated)
    total = false_positives + launderings
    which = "do retorno dos analistas e do simulado" if include_simulated else "dos analistas"
    if total < MIN_FEEDBACK_LABELS:
        return msg(
            "retrain.feedback_few_labels",
            f"O retreino com o retorno precisa de pelo menos {MIN_FEEDBACK_LABELS} rótulos"
            f" {which} em períodos fechados; há {total}.",
            min_labels=MIN_FEEDBACK_LABELS,
            total=total,
            scope="analysts_and_simulated" if include_simulated else "analysts",
        )
    if launderings == 0:
        return msg(
            "retrain.feedback_no_laundering",
            "O retorno ainda não tem nenhuma lavagem confirmada (alerta comunicado): o modelo"
            " aprenderia só com falsos positivos.",
        )
    if false_positives == 0:
        return msg(
            "retrain.feedback_no_false_positive",
            "O retorno ainda não tem nenhum falso positivo confirmado: o modelo aprenderia só"
            " com lavagens.",
        )
    return None


def feedback_block_reason(counts: LabelCounts, include_simulated: bool) -> str | None:
    """O texto de ``feedback_block_message`` (em português); ``None`` quando pode."""
    message = feedback_block_message(counts, include_simulated)
    return None if message is None else message.text
