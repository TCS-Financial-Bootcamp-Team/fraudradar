-- Esquema do FraudRadar PLD. Roda uma vez, quando o volume do Postgres é criado.
-- Datas do SAML-D não têm fuso: occurred_at e week ficam sem timezone.
-- `week` é sempre a segunda-feira da semana.
-- Este DDL não qualifica schemas de propósito: pode ser aplicado depois de
-- `SET LOCAL search_path TO <schema_do_conjunto>, public`. O tipo vector vive em public.

-- Transações do SAML-D (~9,5 mi linhas), carregadas por COPY.
-- Sem FK para accounts: accounts é derivada de transactions e a FK deixaria a carga lenta.
-- ingestion_id: o envio pela API que trouxe a transação; NULL na carga do SAML-D. Também sem
-- FK, pelo mesmo motivo (o gatilho rodaria a cada linha do COPY): a API grava os dois juntos.
CREATE TABLE transactions (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at       TIMESTAMP     NOT NULL,
    sender            BIGINT        NOT NULL,
    receiver          BIGINT        NOT NULL,
    amount            NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    payment_currency  TEXT          NOT NULL,
    received_currency TEXT          NOT NULL,
    sender_country    TEXT          NOT NULL,
    receiver_country  TEXT          NOT NULL,
    payment_type      TEXT          NOT NULL,
    ingestion_id      BIGINT
);
CREATE INDEX transactions_sender_occurred_at_idx ON transactions (sender, occurred_at);
CREATE INDEX transactions_receiver_occurred_at_idx ON transactions (receiver, occurred_at);

-- Um registro por envio à API (POST /ingestion/csv e /ingestion/transactions); o id é o do
-- recibo. status: received (gravado, ainda sem score) -> processing -> completed, avançado
-- pelo worker quando processar as semanas das transações do envio.
CREATE TABLE ingestions (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source     TEXT        NOT NULL DEFAULT 'api'
               CHECK (source IN ('csv', 'manual', 'api', 'simulation', 'connection')),
    file_name  TEXT,
    row_count  INTEGER     NOT NULL CHECK (row_count > 0),
    status     TEXT        NOT NULL DEFAULT 'received'
               CHECK (status IN ('received', 'processing', 'completed')),
    created_by TEXT        NOT NULL CHECK (length(btrim(created_by)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gabarito, separado de propósito: o modelo NUNCA lê esta tabela.
CREATE TABLE ground_truth (
    transaction_id    BIGINT   PRIMARY KEY REFERENCES transactions (id) ON DELETE CASCADE,
    label             SMALLINT NOT NULL CHECK (label IN (0, 1)),
    original_typology TEXT     NOT NULL,
    typology          TEXT     NOT NULL
);

-- Contas sem país fixo (o país vem de cada transação).
CREATE TABLE accounts (
    account       BIGINT      PRIMARY KEY,
    first_seen_at TIMESTAMP   NOT NULL,
    last_seen_at  TIMESTAMP   NOT NULL,
    segment       SMALLINT,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (last_seen_at >= first_seen_at)
);

CREATE TABLE model_versions (
    version    TEXT        PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    features   JSONB       NOT NULL,
    threshold  REAL        NOT NULL CHECK (threshold BETWEEN 0 AND 1),
    metrics    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    active     BOOLEAN     NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX model_versions_single_active_idx ON model_versions (active) WHERE active;

CREATE TABLE transaction_scores (
    transaction_id BIGINT      NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    model_version  TEXT        NOT NULL REFERENCES model_versions (version),
    score          REAL        NOT NULL CHECK (score BETWEEN 0 AND 1),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (transaction_id, model_version)
);

-- Um lote por semana processada pelo worker. `released_at` é o replay da demo:
-- a API libera uma semana por vez (POST /replay/next-week).
-- metrics é a avaliação contra `ground_truth`, calculada pelo worker:
--   {"recall": 0..1, "typology_accuracy": 0..1,
--    "country_rates": {"UK": 0..1, ...}, "payment_type_rates": {"Cash Deposit": 0..1, ...}}
CREATE TABLE weekly_batches (
    week            DATE        PRIMARY KEY CHECK (extract(isodow FROM week) = 1),
    model_version   TEXT        NOT NULL REFERENCES model_versions (version),
    active_accounts INTEGER     NOT NULL CHECK (active_accounts >= 0),
    metrics         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at     TIMESTAMPTZ
);

-- Fila semanal por conta, escrita pelo worker. `countries` vem ordenado pelo valor
-- movimentado (countries[1] é o país exibido na fila); `typology` é a prevista
-- pelo modelo, nunca a de `ground_truth`; total_amount e transaction_count resumem as
-- transações da conta na semana, enviadas e recebidas.
-- origin: 'model' = a conta passou do corte da fila; 'exploration' = amostra de controle, conta
-- sorteada FORA da fila para o analista revisar e o sistema medir o que o modelo deixa passar
-- (docs/analyst-feedback.md). Não é conta suspeita: fica fora das contagens de alertas.
CREATE TABLE alerts (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account           BIGINT        NOT NULL REFERENCES accounts (account),
    week              DATE          NOT NULL CHECK (extract(isodow FROM week) = 1),
    score             REAL          NOT NULL CHECK (score BETWEEN 0 AND 1),
    queue_position    INTEGER       NOT NULL CHECK (queue_position > 0),
    status            TEXT          NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new', 'in_review', 'archived', 'escalated', 'reported')),
    countries         TEXT[]        NOT NULL DEFAULT '{}',
    typology          TEXT,
    total_amount      NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    transaction_count INTEGER       NOT NULL DEFAULT 0 CHECK (transaction_count >= 0),
    model_version     TEXT          NOT NULL REFERENCES model_versions (version),
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    origin            TEXT          NOT NULL DEFAULT 'model'
                      CONSTRAINT alerts_origin_check CHECK (origin IN ('model', 'exploration')),
    UNIQUE (account, week)
);
CREATE INDEX alerts_queue_idx ON alerts (week, status, queue_position);
CREATE INDEX alerts_countries_idx ON alerts USING gin (countries);

-- contributions: {"<feature>": contribuição SHAP em log-odds} (positiva = puxa para suspeito).
-- rules: [{"code": "R-001", "description": "...", "detail": {...}}], ver db/rules/.
CREATE TABLE evidence (
    alert_id       BIGINT      PRIMARY KEY REFERENCES alerts (id) ON DELETE CASCADE,
    contributions  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    rules          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    weekly_signals JSONB       NOT NULL DEFAULT '{}'::jsonb,
    graph          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sources: [{"title": "...", "excerpt": "..."}], na ordem das citações [1], [2]...
CREATE TABLE assessments (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id           BIGINT      NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    content            TEXT        NOT NULL,
    suggested_typology TEXT,
    sources            JSONB       NOT NULL DEFAULT '[]'::jsonb,
    validation         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    is_valid           BOOLEAN,
    llm_model          TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessments_alert_idx ON assessments (alert_id, created_at DESC);

-- archive_reason: por que o analista arquivou. Só 'false_positive' (falso positivo confirmado)
-- ensina o modelo; 'insufficient_evidence' (sem evidência suficiente) não vira rótulo. A API exige
-- o motivo em todo arquivamento novo; NULL só existe em arquivamentos de antes desta coluna.
CREATE TABLE decisions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id      BIGINT      NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    assessment_id BIGINT      REFERENCES assessments (id),
    analyst       TEXT        NOT NULL CHECK (length(btrim(analyst)) > 0),
    decision      TEXT        NOT NULL CHECK (decision IN ('archive', 'escalate', 'report')),
    justification TEXT        NOT NULL CHECK (length(btrim(justification)) > 0),
    decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    archive_reason TEXT
                  CONSTRAINT decisions_archive_reason_check CHECK (
                      archive_reason IS NULL
                      OR (decision = 'archive'
                          AND archive_reason IN ('false_positive', 'insufficient_evidence'))
                  )
);
CREATE INDEX decisions_alert_idx ON decisions (alert_id, decided_at DESC);

CREATE TABLE reports (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id    BIGINT      NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    decision_id BIGINT      NOT NULL REFERENCES decisions (id),
    draft       TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

-- Retorno dos analistas: o rótulo que a última decisão de cada alerta deixou, para o retreino e
-- para o painel do retorno. Nunca se mistura com `ground_truth` (docs/analyst-feedback.md).
--   label 1 = lavagem confirmada (decisão `report`);
--   label 0 = falso positivo confirmado (`archive` com archive_reason = 'false_positive').
-- `escalate` e `archive` sem evidência suficiente não deixam rótulo: a linha é apagada.
-- origin é copiado do alerta; source separa a decisão de uma pessoa ('analyst') da do analista
-- simulado da demonstração ('simulated', `python -m worker simulate-analyst`).
CREATE TABLE analyst_labels (
    alert_id    BIGINT      PRIMARY KEY REFERENCES alerts (id) ON DELETE CASCADE,
    decision_id BIGINT      NOT NULL REFERENCES decisions (id) ON DELETE CASCADE,
    account     BIGINT      NOT NULL,
    week        DATE        NOT NULL CHECK (extract(isodow FROM week) = 1),
    label       SMALLINT    NOT NULL CHECK (label IN (0, 1)),
    origin      TEXT        NOT NULL CHECK (origin IN ('model', 'exploration')),
    source      TEXT        NOT NULL CHECK (source IN ('analyst', 'simulated')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analyst_labels_week_idx ON analyst_labels (week);

-- 384 dimensões: embedding multilíngue pequeno (multilingual-e5-small / MiniLM).
CREATE TABLE rag_documents (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source      TEXT        NOT NULL,
    chunk_index INTEGER     NOT NULL,
    content     TEXT        NOT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    embedding   vector(384) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source, chunk_index)
);
CREATE INDEX rag_documents_embedding_idx ON rag_documents USING hnsw (embedding vector_cosine_ops);

CREATE TABLE audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor       TEXT        NOT NULL,
    action      TEXT        NOT NULL,
    entity      TEXT,
    entity_id   TEXT,
    details     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_occurred_at_idx ON audit_log (occurred_at DESC);
