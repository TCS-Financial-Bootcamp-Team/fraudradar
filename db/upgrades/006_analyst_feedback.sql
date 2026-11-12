-- Retorno dos analistas (docs/analyst-feedback.md): leva um banco que JÁ EXISTE para o esquema
-- novo, sem apagar nada. Fica fora de db/init de propósito: nunca roda na criação do volume, que
-- já nasce com este esquema (002_tables.sql e 004_processing.sql).
--
--   docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
--     < db/upgrades/006_analyst_feedback.sql
--
-- Pode rodar mais de uma vez: cada passo só age no que ainda falta. Vale para `public` (o SAML-D)
-- e para o schema de cada conjunto registrado em public.datasets.

BEGIN;

DO $$
DECLARE
    target TEXT;
    previous_path TEXT := current_setting('search_path');
BEGIN
    FOR target IN SELECT schema_name FROM public.datasets ORDER BY slug LOOP
        -- O mesmo DDL sem schema de 002_tables.sql, aplicado no schema do conjunto.
        PERFORM set_config('search_path', format('%I, public', target), true);

        ALTER TABLE alerts
            ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'model'
            CONSTRAINT alerts_origin_check CHECK (origin IN ('model', 'exploration'));

        ALTER TABLE decisions
            ADD COLUMN IF NOT EXISTS archive_reason TEXT
            CONSTRAINT decisions_archive_reason_check CHECK (
                archive_reason IS NULL
                OR (decision = 'archive'
                    AND archive_reason IN ('false_positive', 'insufficient_evidence'))
            );

        CREATE TABLE IF NOT EXISTS analyst_labels (
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
        CREATE INDEX IF NOT EXISTS analyst_labels_week_idx ON analyst_labels (week);

        -- Decisões de antes desta mudança: a última decisão de cada alerta, quando foi comunicar,
        -- vira rótulo de lavagem confirmada, pela mesma regra das decisões novas. Arquivamento
        -- antigo não tem motivo (archive_reason vazio) e por isso não vira rótulo.
        INSERT INTO analyst_labels (alert_id, decision_id, account, week, label, origin, source)
        SELECT a.id, d.id, a.account, a.week, 1, a.origin, 'analyst'
        FROM alerts a
        JOIN LATERAL (
            SELECT id, decision FROM decisions
            WHERE alert_id = a.id
            ORDER BY decided_at DESC, id DESC
            LIMIT 1
        ) d ON true
        WHERE d.decision = 'report'
        ON CONFLICT (alert_id) DO NOTHING;
    END LOOP;
    PERFORM set_config('search_path', previous_path, true);
END
$$;

-- Amostra de controle por semana (configuração global, uma linha por conjunto).
ALTER TABLE public.processing_settings
    ADD COLUMN IF NOT EXISTS exploration_per_week INTEGER NOT NULL DEFAULT 5
    CONSTRAINT processing_settings_exploration_per_week_check
    CHECK (exploration_per_week BETWEEN 0 AND 50);

COMMIT;
