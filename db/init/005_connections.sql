-- Conexões com bancos Postgres externos (docs/external-data.md). Tabela global, sempre em public.
-- A senha só existe cifrada (Fernet, chave CONNECTIONS_SECRET_KEY) e nunca sai em resposta nem em log.

CREATE TABLE public.external_connections (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name               TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
    host               TEXT        NOT NULL CHECK (length(btrim(host)) > 0),
    port               INTEGER     NOT NULL CHECK (port BETWEEN 1 AND 65535),
    database           TEXT        NOT NULL CHECK (length(btrim(database)) > 0),
    username           TEXT        NOT NULL CHECK (length(btrim(username)) > 0),
    password_encrypted TEXT        NOT NULL,
    -- [schema.]tabela, validada como identificador antes de gravar e citada em toda leitura.
    source_table       TEXT        NOT NULL,
    -- Data/hora ou número crescente, para ler só o que é novo. NULL = só dá para importar o histórico.
    control_column     TEXT,
    -- Último valor da coluna de controle já lido (texto; o servidor da fonte converte).
    last_position      TEXT,
    -- untested = nunca testada; connected = teste ok; incompatible = teste achou problemas;
    -- error = a última leitura falhou; syncing = importação em andamento.
    status             TEXT        NOT NULL DEFAULT 'untested'
                       CHECK (status IN ('untested', 'connected', 'incompatible', 'error', 'syncing')),
    -- Relatório do último teste (JSON; ver fraudradar.sources.compatibility).
    compatibility      JSONB,
    last_error         TEXT,
    -- Conjunto de destino e modo de processamento, definidos ao importar.
    dataset            TEXT REFERENCES public.datasets (slug),
    mode               TEXT        CHECK (mode IN ('history', 'follow', 'both')),
    last_synced_at     TIMESTAMPTZ,
    created_by         TEXT        NOT NULL CHECK (length(btrim(created_by)) > 0),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- O acompanhamento busca as conexões ativas de um conjunto a cada rodada de processamento.
CREATE INDEX external_connections_follow_idx
    ON public.external_connections (dataset)
    WHERE mode IN ('follow', 'both');
