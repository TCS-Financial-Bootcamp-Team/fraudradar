"""Decisões e comunicações na transação da requisição."""

import json
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import Connection, RowMapping, text

from api.dependencias import Usuario
from api.dominio import STATUS_DA_DECISAO, alerta_de_linha, linha_do_alerta, segunda_feira
from api.schemas.alertas import Alerta, Comunicacao, PedidoAprovacao, PedidoDecisao


def rascunho_comunicacao(alerta: RowMapping, justificativa: str, parecer: str | None) -> str:
    """Texto acadêmico determinístico; reserva espaço para o encerramento."""
    inicio = segunda_feira(alerta["semana"])
    fim = inicio + timedelta(days=6)
    valor = f"{alerta['valor_total']:,.2f}".translate(str.maketrans({",": ".", ".": ","}))
    corpo = (
        "COMUNICAÇÃO DE OPERAÇÃO SUSPEITA — SIMULAÇÃO ACADÊMICA\n\n"
        f"Conta: {alerta['conta']}\n"
        f"Semana: {inicio:%d/%m/%Y} a {fim:%d/%m/%Y}\n"
        f"Score: {float(alerta['score']) * 100:.1f}%\n"
        f"Tipologia prevista: {alerta['tipologia'] or 'Indefinida'}\n"
        f"Valor total: £ {valor}\n"
        f"Quantidade de transações: {alerta['qtd_transacoes']}\n"
        f"Países: {', '.join(alerta['paises']) or 'Indefinidos'}\n\n"
        f"Justificativa do analista: {justificativa}\n"
    )
    encerramento = "\nRascunho gerado pelo FraudRadar PLD. Deve ser revisado antes da aprovação."
    limite = 20000 - len(encerramento)
    corpo = corpo[:limite]
    if parecer:
        corpo += f"\nParecer mais recente:\n{parecer}"[: limite - len(corpo)]
    return corpo + encerramento


def _verificar_aberto(conn: Connection, alerta_id: int) -> None:
    aprovada = conn.execute(
        text("SELECT id FROM comunicacoes WHERE alerta_id = :id AND status = 'aprovada' LIMIT 1"),
        {"id": alerta_id},
    ).scalar_one_or_none()
    if aprovada is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A comunicação deste alerta já foi aprovada.")


def _ultima_comunicacao(conn: Connection, alerta_id: int) -> RowMapping:
    linha = (
        conn.execute(
            text(
                "SELECT * FROM comunicacoes WHERE alerta_id = :id"
                " ORDER BY criado_em DESC, id DESC LIMIT 1"
            ),
            {"id": alerta_id},
        )
        .mappings()
        .first()
    )
    if linha is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Este alerta não tem comunicação.")
    return linha


def _comunicacao_de_linha(linha: RowMapping) -> Comunicacao:
    return Comunicacao(
        alerta_id=str(linha["alerta_id"]),
        texto=linha["rascunho"],
        status=linha["status"],
        atualizado_em=linha["aprovado_em"] or linha["criado_em"],
    )


def _auditar(conn: Connection, alerta_id: int, usuario: Usuario, acao: str, detalhes: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO auditoria (quem, acao, entidade, entidade_id, detalhes)"
            " VALUES (:quem, :acao, 'alerta', :id, CAST(:detalhes AS jsonb))"
        ),
        {
            "quem": usuario.nome,
            "acao": acao,
            "id": str(alerta_id),
            "detalhes": json.dumps({**detalhes, "usuario_id": usuario.id}),
        },
    )


def registrar_decisao(
    conn: Connection, alerta_id: int, pedido: PedidoDecisao, usuario: Usuario
) -> Alerta:
    alerta = linha_do_alerta(conn, alerta_id, para_atualizar=True)
    _verificar_aberto(conn, alerta_id)
    parecer = (
        conn.execute(
            text(
                "SELECT id, texto FROM pareceres WHERE alerta_id = :id"
                " ORDER BY criado_em DESC, id DESC LIMIT 1"
            ),
            {"id": alerta_id},
        )
        .mappings()
        .first()
    )
    decisao_id = conn.execute(
        text(
            "INSERT INTO decisoes (alerta_id, parecer_id, analista, decisao, justificativa)"
            " VALUES (:id, :parecer, :analista, :decisao, :justificativa) RETURNING id"
        ),
        {
            "id": alerta_id,
            "parecer": parecer["id"] if parecer is not None else None,
            "analista": usuario.nome,
            "decisao": pedido.decisao,
            "justificativa": pedido.justificativa,
        },
    ).scalar_one()
    conn.execute(
        text("UPDATE alertas SET status = :status, atualizado_em = now() WHERE id = :id"),
        {"status": STATUS_DA_DECISAO[pedido.decisao], "id": alerta_id},
    )
    if pedido.decisao == "comunicar":
        texto = rascunho_comunicacao(
            alerta, pedido.justificativa, parecer["texto"] if parecer is not None else None
        )
        # Um rascunho antigo é refeito com a justificativa e o parecer vigentes: o texto editado
        # pelo analista só chega no ato da aprovação, então nada salvo se perde.
        rascunho_id = conn.execute(
            text(
                "UPDATE comunicacoes SET decisao_id = :decisao, rascunho = :texto,"
                " criado_em = now() WHERE alerta_id = :id AND status = 'rascunho' RETURNING id"
            ),
            {"decisao": decisao_id, "texto": texto, "id": alerta_id},
        ).scalar_one_or_none()
        if rascunho_id is None:
            conn.execute(
                text(
                    "INSERT INTO comunicacoes (alerta_id, decisao_id, rascunho, status)"
                    " VALUES (:id, :decisao, :texto, 'rascunho')"
                ),
                {"id": alerta_id, "decisao": decisao_id, "texto": texto},
            )
    _auditar(
        conn, alerta_id, usuario, "decisao", {"decisao": pedido.decisao, "decisao_id": decisao_id}
    )
    return alerta_de_linha(linha_do_alerta(conn, alerta_id))


def obter_comunicacao(conn: Connection, alerta_id: int) -> Comunicacao:
    linha_do_alerta(conn, alerta_id)
    return _comunicacao_de_linha(_ultima_comunicacao(conn, alerta_id))


def aprovar_comunicacao(
    conn: Connection, alerta_id: int, pedido: PedidoAprovacao, usuario: Usuario
) -> Comunicacao:
    alerta = linha_do_alerta(conn, alerta_id, para_atualizar=True)
    comunicacao = _ultima_comunicacao(conn, alerta_id)
    _verificar_aberto(conn, alerta_id)
    if alerta["status"] != "comunicado":
        raise HTTPException(status.HTTP_409_CONFLICT, "A decisão atual do alerta não é comunicar.")
    linha = (
        conn.execute(
            text(
                "UPDATE comunicacoes SET rascunho = :texto, status = 'aprovada',"
                " aprovado_por = :analista, aprovado_em = now() WHERE id = :id RETURNING *"
            ),
            {"texto": pedido.texto, "analista": usuario.nome, "id": comunicacao["id"]},
        )
        .mappings()
        .one()
    )
    _auditar(conn, alerta_id, usuario, "comunicacao_aprovada", {"comunicacao_id": linha["id"]})
    return _comunicacao_de_linha(linha)
