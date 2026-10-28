"""SQL da fila de alertas, do detalhe e do grafo de 2 saltos."""

from datetime import date, datetime, time, timedelta
from typing import Any, Literal

from sqlalchemy import Connection, RowMapping, text

from api.dominio import COLUNAS_ALERTA, STATUS_DO_FRONT
from api.schemas.alertas import (
    Aresta,
    Contribuicao,
    Fonte,
    Movimentacao,
    No,
    Parecer,
    Regra,
    StatusAlerta,
)
from fraudradar.dados.schema import MOEDA_DOS_VALORES
from fraudradar.features import rotulo_feature

Ordem = Literal["score_desc", "fila"]

_ORDEM_SQL: dict[Ordem, str] = {
    "score_desc": "a.score DESC, a.posicao_fila, a.id",
    "fila": "a.posicao_fila, a.id",
}

TOP_CONTRIBUICOES = 6
LIMITE_MOVIMENTACOES = 200
LIMITE_ARESTAS = 30


def janela_da_semana(semana: date) -> tuple[datetime, datetime]:
    """[segunda 00:00, segunda seguinte 00:00)."""
    inicio = datetime.combine(semana, time.min)
    return inicio, inicio + timedelta(days=7)


def listar_fila(
    conn: Connection,
    semana: date,
    *,
    status: StatusAlerta | None,
    pais: str | None,
    pagina: int,
    tamanho: int,
    ordenar: Ordem,
) -> tuple[list[RowMapping], int]:
    """Página da fila e total com os mesmos filtros."""
    filtros = ["a.semana = :semana"]
    params: dict[str, Any] = {"semana": semana}
    if status is not None:
        filtros.append("a.status = ANY(CAST(:status AS text[]))")
        params["status"] = list(STATUS_DO_FRONT[status])
    if pais is not None:
        filtros.append("a.paises @> CAST(:pais AS text[])")
        params["pais"] = [pais]
    onde = " AND ".join(filtros)
    total = conn.execute(text(f"SELECT count(*) FROM alertas a WHERE {onde}"), params).scalar_one()
    linhas = (
        conn.execute(
            text(
                f"SELECT {COLUNAS_ALERTA} FROM alertas a WHERE {onde}"
                f" ORDER BY {_ORDEM_SQL[ordenar]} LIMIT :limite OFFSET :deslocamento"
            ),
            {**params, "limite": tamanho, "deslocamento": (pagina - 1) * tamanho},
        )
        .mappings()
        .all()
    )
    return list(linhas), total


def paises_da_semana(conn: Connection, semana: date) -> list[str]:
    """Todos os países da semana, para o dropdown do front."""
    return list(
        conn.execute(
            text(
                "SELECT DISTINCT unnest(paises) AS pais FROM alertas"
                " WHERE semana = :semana ORDER BY pais"
            ),
            {"semana": semana},
        ).scalars()
    )


def contribuicoes_do_alerta(conn: Connection, alerta_id: int) -> list[Contribuicao]:
    """Top 6 contribuições SHAP positivas, em % do total das positivas."""
    bruto = conn.execute(
        text("SELECT contribuicoes FROM evidencias WHERE alerta_id = :id"), {"id": alerta_id}
    ).scalar()
    if not isinstance(bruto, dict):
        return []
    positivas = {
        nome: float(v)
        for nome, v in bruto.items()
        if isinstance(v, int | float) and not isinstance(v, bool) and v > 0
    }
    soma = sum(positivas.values())
    if soma <= 0:
        return []
    ordenadas = sorted(positivas.items(), key=lambda par: par[1], reverse=True)
    return [
        Contribuicao(nome=rotulo_feature(nome), valor=round(v / soma * 100, 1))
        for nome, v in ordenadas[:TOP_CONTRIBUICOES]
    ]


def regras_do_alerta(conn: Connection, alerta_id: int) -> list[Regra]:
    bruto = conn.execute(
        text("SELECT regras FROM evidencias WHERE alerta_id = :id"), {"id": alerta_id}
    ).scalar()
    if not isinstance(bruto, list):
        return []
    return [
        Regra(codigo=r["codigo"], descricao=r["descricao"])
        for r in bruto
        if isinstance(r, dict)
        and isinstance(r.get("codigo"), str)
        and isinstance(r.get("descricao"), str)
    ]


def movimentacoes_da_conta(conn: Connection, conta: int, semana: date) -> list[Movimentacao]:
    """Transações da conta na semana (enviadas e recebidas) em ordem cronológica.

    Acima de 200, ficam as 200 de maior valor: cortar por data esconderia o fim da semana.
    O total real está em `transacoes` do alerta.
    """
    inicio, fim = janela_da_semana(semana)
    # Dois ramos para usar os índices (remetente, data_hora) e (recebedor, data_hora);
    # o segundo exclui remetente = conta para a autotransferência aparecer uma vez.
    linhas = conn.execute(
        text(
            """
            SELECT * FROM (
                SELECT id, data_hora, remetente, recebedor, valor, moeda_pagamento, tipo_pagamento
                FROM (
                    SELECT id, data_hora, remetente, recebedor, valor, moeda_pagamento,
                           tipo_pagamento
                    FROM transacoes
                    WHERE remetente = :conta AND data_hora >= :inicio AND data_hora < :fim
                    UNION ALL
                    SELECT id, data_hora, remetente, recebedor, valor, moeda_pagamento,
                           tipo_pagamento
                    FROM transacoes
                    WHERE recebedor = :conta AND remetente <> :conta
                      AND data_hora >= :inicio AND data_hora < :fim
                ) t
                ORDER BY valor DESC, data_hora, id
                LIMIT :limite
            ) maiores
            ORDER BY data_hora, id
            """
        ),
        {"conta": conta, "inicio": inicio, "fim": fim, "limite": LIMITE_MOVIMENTACOES},
    ).mappings()
    return [
        Movimentacao(
            id=str(t["id"]),
            data=t["data_hora"].isoformat(),
            origem=str(t["remetente"]),
            destino=str(t["recebedor"]),
            valor=float(t["valor"]),
            moeda=MOEDA_DOS_VALORES,
            meio=t["tipo_pagamento"],
            moeda_pagamento=t["moeda_pagamento"],
        )
        for t in linhas
    ]


def parecer_mais_recente(conn: Connection, alerta_id: int) -> Parecer | None:
    linha = (
        conn.execute(
            text(
                "SELECT texto, fontes FROM pareceres WHERE alerta_id = :id"
                " ORDER BY criado_em DESC, id DESC LIMIT 1"
            ),
            {"id": alerta_id},
        )
        .mappings()
        .first()
    )
    if linha is None:
        return None
    fontes = linha["fontes"] if isinstance(linha["fontes"], list) else []
    return Parecer(
        texto=linha["texto"],
        fontes=[
            Fonte(titulo=f["titulo"], trecho=f["trecho"])
            for f in fontes
            if isinstance(f, dict)
            and isinstance(f.get("titulo"), str)
            and isinstance(f.get("trecho"), str)
        ],
    )


def _arestas(conn: Connection, sql: str, params: dict[str, Any]) -> list[tuple[int, int, float]]:
    linhas = conn.execute(text(sql), {**params, "limite": LIMITE_ARESTAS}).all()
    return [(int(o), int(d), float(v)) for o, d, v in linhas]


def grafo_de_2_saltos(conn: Connection, conta: int, semana: date) -> tuple[list[No], list[Aresta]]:
    """Arestas (remetente, recebedor) agregadas: salto 1 (30 maiores) e salto 2 (30 maiores)."""
    inicio, fim = janela_da_semana(semana)
    janela = {"inicio": inicio, "fim": fim}
    salto1 = _arestas(
        conn,
        """
        SELECT remetente, recebedor, SUM(valor) AS valor FROM (
            SELECT remetente, recebedor, valor FROM transacoes
            WHERE remetente = :conta AND data_hora >= :inicio AND data_hora < :fim
            UNION ALL
            SELECT remetente, recebedor, valor FROM transacoes
            WHERE recebedor = :conta AND remetente <> :conta
              AND data_hora >= :inicio AND data_hora < :fim
        ) t
        GROUP BY remetente, recebedor
        ORDER BY valor DESC, remetente, recebedor
        LIMIT :limite
        """,
        {"conta": conta, **janela},
    )
    vizinhas = sorted({c for o, d, _ in salto1 for c in (o, d)} - {conta})
    salto2: list[tuple[int, int, float]] = []
    if vizinhas:
        # Arestas que saem ou chegam nas vizinhas, sem tocar a conta; o segundo ramo pula as que
        # o primeiro já pegou (remetente também vizinha).
        salto2 = _arestas(
            conn,
            """
            SELECT remetente, recebedor, SUM(valor) AS valor FROM (
                SELECT remetente, recebedor, valor FROM transacoes
                WHERE remetente = ANY(CAST(:vizinhas AS bigint[])) AND recebedor <> :conta
                  AND data_hora >= :inicio AND data_hora < :fim
                UNION ALL
                SELECT remetente, recebedor, valor FROM transacoes
                WHERE recebedor = ANY(CAST(:vizinhas AS bigint[])) AND remetente <> :conta
                  AND NOT (remetente = ANY(CAST(:vizinhas AS bigint[])))
                  AND data_hora >= :inicio AND data_hora < :fim
            ) t
            GROUP BY remetente, recebedor
            ORDER BY valor DESC, remetente, recebedor
            LIMIT :limite
            """,
            {"conta": conta, "vizinhas": vizinhas, **janela},
        )
    arestas = [
        Aresta(id=f"{o}-{d}", origem=str(o), destino=str(d), valor=v) for o, d, v in salto1 + salto2
    ]
    extremos = {int(a.origem) for a in arestas} | {int(a.destino) for a in arestas}
    nos = [No(id=str(conta), rotulo=str(conta), central=True)] + [
        No(id=str(c), rotulo=str(c), central=False) for c in sorted(extremos - {conta})
    ]
    return nos, arestas
