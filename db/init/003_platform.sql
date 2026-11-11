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
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.datasets (slug, name, schema_name, origin)
VALUES ('saml-d', 'SAML-D', 'public', 'saml-d');

CREATE TABLE public.jobs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        TEXT        NOT NULL CHECK (kind IN ('import', 'process', 'train')),
    dataset     TEXT        NOT NULL REFERENCES public.datasets (slug),
    payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status      TEXT        NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'done', 'failed')),
    progress    INTEGER     NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    message     TEXT,
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
