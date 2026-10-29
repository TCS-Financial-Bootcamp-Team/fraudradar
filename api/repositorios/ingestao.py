"""Ingestão: grava o envio (`ingestoes`), as transações e a auditoria na transação da requisição.

A validação é a de fraudradar.dados.ingestao, a mesma que o worker vai usar. Nada é gravado em
`avaliacao`: rótulos não entram pela API.
"""

import json
import re
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy import Connection, text

from api.dependencias import Usuario
from api.schemas.ingestao import PedidoTransacao, Recibo
from fraudradar.config import get_settings
from fraudradar.dados import ingestao
from fraudradar.dados.ingestao import Erro, Transacao

# Colunas gravadas: as de Transacao, na ordem dela, e o envio de origem.
COLUNAS = (*Transacao._fields, "ingestao_id")
_CONTROLE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _milhar(numero: int) -> str:
    return f"{numero:,}".replace(",", ".")


def _erros(erros: list[Erro], *local: str) -> HTTPException:
    """422 no formato do Pydantic ({type, loc, msg}); no arquivo, a msg traz linha e coluna."""
    detalhes = []
    for erro in erros:
        msg = erro.mensagem
        if erro.linha is not None:
            onde = f"Linha {erro.linha}" + (f", coluna {erro.coluna}" if erro.coluna else "")
            msg = f"{onde}: {msg}"
        loc = [*local, *(p for p in (erro.linha, erro.coluna) if p is not None)]
        detalhes.append({"type": "value_error", "loc": loc, "msg": msg})
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detalhes)


def _nome_do_arquivo(nome: str | None) -> str | None:
    """Só o nome, sem pastas nem caracteres de controle, com até 255 caracteres."""
    nome = _CONTROLE.sub("", (nome or "").replace("\\", "/").rsplit("/", 1)[-1]).strip()
    return nome[:255] or None


def _registrar(
    conn: Connection, origem: str, nome_arquivo: str | None, linhas: int, usuario: Usuario
) -> int:
    return conn.execute(
        text(
            "INSERT INTO ingestoes (origem, nome_arquivo, linhas, quem)"
            " VALUES (:origem, :nome, :linhas, :quem) RETURNING id"
        ),
        {"origem": origem, "nome": nome_arquivo, "linhas": linhas, "quem": usuario.nome},
    ).scalar_one()


def _auditar(conn: Connection, ingestao_id: int, usuario: Usuario, detalhes: dict) -> None:
    conn.execute(
        text(
            "INSERT INTO auditoria (quem, acao, entidade, entidade_id, detalhes)"
            " VALUES (:quem, 'ingestao', 'ingestao', :id, CAST(:detalhes AS jsonb))"
        ),
        {
            "quem": usuario.nome,
            "id": str(ingestao_id),
            "detalhes": json.dumps({**detalhes, "usuario_id": usuario.id}),
        },
    )


def _recibo(ingestao_id: int, linhas: int) -> Recibo:
    quantidade = (
        "1 transação recebida" if linhas == 1 else f"{_milhar(linhas)} transações recebidas"
    )
    return Recibo(
        id=str(ingestao_id),
        status="recebido",
        mensagem=f"{quantidade}. O score sai no processamento semanal.",
    )


def gravar_csv(
    conn: Connection, arquivo: BinaryIO, nome_arquivo: str | None, usuario: Usuario
) -> Recibo:
    """Valida o arquivo inteiro e só então grava por COPY. Uma linha com erro recusa tudo."""
    max_linhas = get_settings().ingestao_max_linhas
    try:
        # 1ª leitura: valida antes de tocar no banco, então arquivo com erro não abre COPY.
        linhas = sum(1 for _ in ingestao.ler_csv(arquivo, max_linhas=max_linhas))
    except ingestao.LinhasDemais as exc:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"O arquivo passa de {_milhar(exc.limite)} linhas. Divida o CSV em partes menores.",
        ) from exc
    except ingestao.TransacoesInvalidas as exc:
        raise _erros(exc.erros, "body", "arquivo") from exc
    nome = _nome_do_arquivo(nome_arquivo)
    ingestao_id = _registrar(conn, "csv", nome, linhas, usuario)
    # 2ª leitura, do arquivo já validado: COPY pela conexão psycopg da transação da requisição.
    arquivo.seek(0)
    with (
        conn.connection.driver_connection.cursor() as cursor,
        cursor.copy(f"COPY transacoes ({', '.join(COLUNAS)}) FROM STDIN") as copia,
    ):
        for transacao in ingestao.ler_csv(arquivo):
            copia.write_row((*transacao, ingestao_id))
    _auditar(conn, ingestao_id, usuario, {"origem": "csv", "linhas": linhas, "nome_arquivo": nome})
    return _recibo(ingestao_id, linhas)


def gravar_transacao(conn: Connection, pedido: PedidoTransacao, usuario: Usuario) -> Recibo:
    try:
        transacao = ingestao.transacao(pedido.model_dump())
    except ingestao.TransacoesInvalidas as exc:
        raise _erros(exc.erros, "body") from exc
    ingestao_id = _registrar(conn, "manual", None, 1, usuario)
    conn.execute(
        text(
            f"INSERT INTO transacoes ({', '.join(COLUNAS)})"
            f" VALUES ({', '.join(':' + coluna for coluna in COLUNAS)})"
        ),
        {**transacao._asdict(), "ingestao_id": ingestao_id},
    )
    _auditar(conn, ingestao_id, usuario, {"origem": "manual", "linhas": 1})
    return _recibo(ingestao_id, 1)
