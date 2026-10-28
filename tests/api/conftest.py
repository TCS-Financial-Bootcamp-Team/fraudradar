"""Testes da API contra um Postgres de verdade, com o esquema de db/init/.

Sem Postgres acessível os testes que usam `banco` são pulados; no CI
(EXIGIR_BANCO_TESTE=1) falham. Local: `docker compose up -d db`.
"""

import json
import os
from collections.abc import Iterator
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from fraudradar.banco import get_engine
from fraudradar.config import RAIZ, get_settings

URL_PADRAO = "postgresql+psycopg://fraudradar:fraudradar@localhost:5432/fraudradar_teste"


@pytest.fixture(scope="session")
def url_banco_teste() -> str:
    """Recria o banco de teste uma vez por sessão e aplica db/init/*.sql."""
    url = make_url(os.environ.get("TEST_DATABASE_URL", URL_PADRAO))
    # O fixture apaga o banco: nunca aponte para o banco de desenvolvimento.
    if not (url.database or "").endswith("_teste"):
        pytest.fail(f"TEST_DATABASE_URL precisa de um banco terminado em _teste: {url.database}")
    admin = create_engine(
        url.set(database="postgres"),
        isolation_level="AUTOCOMMIT",
        connect_args={"connect_timeout": 3},
    )
    try:
        with admin.connect() as conn:
            conn.exec_driver_sql(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)')
            conn.exec_driver_sql(f'CREATE DATABASE "{url.database}"')
    except OperationalError as exc:
        if os.environ.get("EXIGIR_BANCO_TESTE") == "1":
            raise
        motivo = f"Postgres de teste indisponível ({type(exc).__name__})"
        pytest.skip(f"{motivo}: docker compose up -d db")
    finally:
        admin.dispose()
    engine = create_engine(url)
    with engine.begin() as conn:
        for arquivo in sorted((RAIZ / "db" / "init").glob("*.sql")):
            conn.exec_driver_sql(arquivo.read_text(encoding="utf-8"))
    engine.dispose()
    return url.render_as_string(hide_password=False)


@pytest.fixture
def banco(url_banco_teste, monkeypatch) -> Iterator[Engine]:
    """Banco vazio a cada teste; get_engine() (e portanto a API) aponta para ele."""
    monkeypatch.setenv("DATABASE_URL", url_banco_teste)
    get_settings.cache_clear()
    get_engine.cache_clear()
    engine = get_engine()
    with engine.begin() as conn:
        tabelas = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        ).scalars()
        conn.exec_driver_sql(f"TRUNCATE {', '.join(tabelas)} RESTART IDENTITY CASCADE")
    yield engine
    engine.dispose()


@pytest.fixture
def cliente(banco, monkeypatch) -> Iterator[TestClient]:
    """Cliente da API com autenticação desligada: o usuário é USUARIO_LOCAL."""
    monkeypatch.setenv("AUTH_DESLIGADA", "true")
    get_settings.cache_clear()
    from api.main import criar_app

    with TestClient(criar_app()) as c:
        yield c


@pytest.fixture
def semente(banco) -> "Semente":
    return Semente(banco)


class Semente:
    """Insere linhas mínimas e coerentes com o esquema. Cada método devolve o id criado.

    Os formatos JSON (evidências, fontes, métricas) são o contrato com o worker:
    veja os comentários de db/init/002_tabelas.sql.
    """

    VERSAO = "teste-v1"

    def __init__(self, engine: Engine):
        self.engine = engine

    def _exec(self, sql: str, **params):
        with self.engine.begin() as conn:
            resultado = conn.execute(text(sql), params)
            return resultado.scalar() if resultado.returns_rows else None

    def modelo(self, versao: str = VERSAO, *, ativa: bool = True) -> str:
        self._exec(
            "INSERT INTO modelo_versoes (versao, features, limiar, ativa)"
            " VALUES (:v, '[]'::jsonb, 0.5, :a) ON CONFLICT (versao) DO NOTHING",
            v=versao,
            a=ativa,
        )
        return versao

    def conta(self, conta: int) -> int:
        self._exec(
            "INSERT INTO contas (conta, primeira_data, ultima_data)"
            " VALUES (:c, '2022-10-07', '2023-08-23') ON CONFLICT (conta) DO NOTHING",
            c=conta,
        )
        return conta

    def transacao(
        self,
        remetente: int,
        recebedor: int,
        data_hora: datetime,
        valor: float = 100.0,
        *,
        moeda: str = "UK pounds",
        moeda_recebida: str | None = None,
        pais_remetente: str = "UK",
        pais_recebedor: str = "UK",
        tipo: str = "Cross-border",
        rotulo: int | None = None,
        tipologia: str = "Normal_Small_Fan_Out",
    ) -> int:
        """Transação; com `rotulo` grava também o gabarito em `avaliacao`."""
        tid = self._exec(
            "INSERT INTO transacoes (data_hora, remetente, recebedor, valor, moeda_pagamento,"
            " moeda_recebida, pais_remetente, pais_recebedor, tipo_pagamento)"
            " VALUES (:dh, :r, :d, :v, :mp, :mr, :pr, :pd, :t) RETURNING id",
            dh=data_hora,
            r=remetente,
            d=recebedor,
            v=valor,
            mp=moeda,
            mr=moeda_recebida or moeda,
            pr=pais_remetente,
            pd=pais_recebedor,
            t=tipo,
        )
        if rotulo is not None:
            self._exec(
                "INSERT INTO avaliacao (transacao_id, rotulo, tipologia_original, tipologia)"
                " VALUES (:id, :r, :t, :t)",
                id=tid,
                r=rotulo,
                t=tipologia,
            )
        return tid

    def alerta(
        self,
        conta: int,
        semana: date,
        *,
        score: float = 0.9,
        posicao: int = 1,
        status: str = "novo",
        paises: tuple[str, ...] = ("UK",),
        tipologia: str | None = "Fan-out",
        valor_total: float = 1000.0,
        qtd_transacoes: int = 3,
        versao: str = VERSAO,
    ) -> int:
        self.modelo(versao)
        self.conta(conta)
        return self._exec(
            "INSERT INTO alertas (conta, semana, score, posicao_fila, status, paises, tipologia,"
            " valor_total, qtd_transacoes, modelo_versao)"
            " VALUES (:c, :s, :sc, :p, :st, :pa, :t, :v, :q, :m) RETURNING id",
            c=conta,
            s=semana,
            sc=score,
            p=posicao,
            st=status,
            pa=list(paises),
            t=tipologia,
            v=valor_total,
            q=qtd_transacoes,
            m=versao,
        )

    def evidencias(
        self,
        alerta_id: int,
        *,
        contribuicoes: dict[str, float] | None = None,
        regras: list[dict] | None = None,
        sinais: dict | None = None,
    ) -> int:
        self._exec(
            "INSERT INTO evidencias (alerta_id, contribuicoes, regras, sinais_semanais)"
            " VALUES (:a, CAST(:c AS jsonb), CAST(:r AS jsonb), CAST(:s AS jsonb))",
            a=alerta_id,
            c=json.dumps(contribuicoes or {}),
            r=json.dumps(regras or []),
            s=json.dumps(sinais or {}),
        )
        return alerta_id

    def parecer(
        self,
        alerta_id: int,
        texto: str = "Parecer de teste [1].",
        *,
        fontes: list[dict] | None = None,
        criado_em: datetime | None = None,
    ) -> int:
        return self._exec(
            "INSERT INTO pareceres (alerta_id, texto, fontes, criado_em)"
            " VALUES (:a, :t, CAST(:f AS jsonb), COALESCE(:c, now())) RETURNING id",
            a=alerta_id,
            t=texto,
            f=json.dumps(fontes if fontes is not None else [{"titulo": "[1] Lei", "trecho": "x"}]),
            c=criado_em,
        )

    def decisao(
        self,
        alerta_id: int,
        decisao: str = "comunicar",
        *,
        analista: str = "Ana Analista",
        justificativa: str = "Justificativa de teste suficiente.",
        parecer_id: int | None = None,
    ) -> int:
        return self._exec(
            "INSERT INTO decisoes (alerta_id, parecer_id, analista, decisao, justificativa)"
            " VALUES (:a, :p, :an, :d, :j) RETURNING id",
            a=alerta_id,
            p=parecer_id,
            an=analista,
            d=decisao,
            j=justificativa,
        )

    def comunicacao(
        self,
        alerta_id: int,
        decisao_id: int,
        rascunho: str = "Rascunho de comunicação ao COAF para teste.",
        *,
        aprovada_por: str | None = None,
    ) -> int:
        """Rascunho; com `aprovada_por` já nasce aprovado."""
        return self._exec(
            "INSERT INTO comunicacoes (alerta_id, decisao_id, rascunho, status, aprovado_por,"
            " aprovado_em) VALUES (:a, :d, :r, :s, :ap,"
            " CASE WHEN CAST(:ap AS text) IS NULL THEN NULL ELSE now() END) RETURNING id",
            a=alerta_id,
            d=decisao_id,
            r=rascunho,
            s="aprovada" if aprovada_por else "rascunho",
            ap=aprovada_por,
        )

    def lote(
        self,
        semana: date,
        *,
        contas_ativas: int = 1000,
        metricas: dict | None = None,
        liberada: bool = False,
        versao: str = VERSAO,
    ) -> date:
        """Semana processada pelo worker; `liberada` simula o replay já tê-la mostrado."""
        self.modelo(versao)
        self._exec(
            "INSERT INTO lotes_semana (semana, modelo_versao, contas_ativas, metricas, liberada_em)"
            " VALUES (:s, :m, :c, CAST(:me AS jsonb), CASE WHEN :l THEN now() END)",
            s=semana,
            m=versao,
            c=contas_ativas,
            me=json.dumps(metricas or {}),
            l=liberada,
        )
        return semana

    def contar(self, tabela: str, where: str = "true", **params) -> int:
        """SELECT count(*) para conferir efeitos colaterais nos testes."""
        return self._exec(f"SELECT count(*) FROM {tabela} WHERE {where}", **params)

    def linha(self, sql: str, **params) -> dict | None:
        with self.engine.connect() as conn:
            r = conn.execute(text(sql), params).mappings().first()
            return dict(r) if r else None
