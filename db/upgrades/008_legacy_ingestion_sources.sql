-- Atualiza as origens de ingestao em bancos existentes.
-- Preserva a origem historica "manual" e permite as novas origens.
-- Executar depois da criacao de public.datasets.
-- Aplicavel a public e aos schemas cadastrados.
--
-- Reexecutavel: recria a mesma restricao sem alterar registros.

BEGIN;

DO $$
DECLARE
    target TEXT;
BEGIN
    IF to_regclass('public.datasets') IS NULL THEN
        RAISE EXCEPTION 'Catalogo public.datasets ausente';
    END IF;

    FOR target IN
        SELECT DISTINCT schema_name
        FROM public.datasets
        ORDER BY schema_name
    LOOP
        IF to_regclass(format('%I.ingestions', target)) IS NULL THEN
            RAISE EXCEPTION 'Tabela ingestions ausente no schema %', target;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = format('%I.ingestions', target)::regclass
              AND conname = 'ingestions_source_check'
              AND contype = 'c'
        ) THEN
            RAISE EXCEPTION 'Restricao de origens ausente no schema %', target;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.ingestions DROP CONSTRAINT ingestions_source_check',
            target
        );

        EXECUTE format(
            $ddl$
            ALTER TABLE %I.ingestions
            ADD CONSTRAINT ingestions_source_check
            CHECK (
                source IN (
                    'csv',
                    'manual',
                    'api',
                    'simulation',
                    'connection'
                )
            )
            $ddl$,
            target
        );

        EXECUTE format(
            'ALTER TABLE %I.ingestions ALTER COLUMN source SET DEFAULT %L',
            target,
            'api'
        );
    END LOOP;
END
$$;

COMMIT;