-- Plataforma de conjuntos de dados e trabalhos em segundo plano.
-- Estas tabelas são globais e ficam sempre em public; as tabelas de domínio de cada
-- conjunto são criadas pelo DDL 002_tables.sql no schema registrado em datasets.

CREATE TABLE public.datasets (
    slug                 TEXT        PRIMARY KEY
                         CHECK (slug ~ '^[a-z0-9-]{1,40}$'),
    name                 TEXT        NOT NULL CHECK (length(btrim(name)) > 0),
    schema_name          TEXT        NOT NULL UNIQUE
                         CHECK (schema_name ~ '^[a-z_][a-z0-9_]{0,62}$'),
    origin               TEXT        NOT NULL CHECK (origin IN ('saml-d', 'external')),
    active_model_version TEXT,
    -- Resumo do gabarito, calculado SÓ pelo worker (depois de load, de importação com gabarito e
    -- de cada treino). A API decide a elegibilidade do retreino lendo estas colunas e nunca lê
    -- ground_truth. labels_checked_at vazio = o worker ainda não mediu.
    labeled_weeks        INTEGER     NOT NULL DEFAULT 0 CHECK (labeled_weeks >= 0),
    has_laundering       BOOLEAN     NOT NULL DEFAULT false,
    labels_checked_at    TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.datasets (slug, name, schema_name, origin, labeled_weeks, has_laundering)
VALUES ('saml-d', 'SAML-D', 'public', 'saml-d', 0, false);

CREATE TABLE public.jobs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        TEXT        NOT NULL CHECK (kind IN ('import', 'process', 'train')),
    dataset     TEXT        NOT NULL REFERENCES public.datasets (slug),
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status      TEXT        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'done', 'failed')),
    progress    INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    message     TEXT,
    -- Código estável e parâmetros da mensagem (o front traduz por eles; `message` segue em português).
    message_code   TEXT,
    message_params JSONB,
    created_by  TEXT        NOT NULL CHECK (length(btrim(created_by)) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    CHECK (status <> 'running' OR started_at IS NOT NULL),
    CHECK (status NOT IN ('done', 'failed') OR finished_at IS NOT NULL)
);

CREATE INDEX jobs_next_queued_idx
    ON public.jobs (created_at, id)
    WHERE status = 'queued';
