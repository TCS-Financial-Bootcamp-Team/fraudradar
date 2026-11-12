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

Sem LightGBM: a imagem da API importa este módulo.
"""

from sqlalchemy import Connection, text

ARCHIVE_REASONS = ("false_positive", "insufficient_evidence")
LAUNDERING = 1  # lavagem confirmada
FALSE_POSITIVE = 0  # falso positivo confirmado
ANALYST = "analyst"  # decisão de uma pessoa
SIMULATED = "simulated"  # decisão do analista simulado (demonstração)


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
