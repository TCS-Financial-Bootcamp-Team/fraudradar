-- Configuração global do processamento contínuo, uma linha por conjunto de dados.
-- O gatilho mantém a configuração presente também para conjuntos criados depois da
-- inicialização do banco, independentemente do fluxo que os cadastrou.

ALTER TABLE public.jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_kind_check CHECK (kind IN ('import', 'process', 'simulate', 'train'));

CREATE TABLE public.processing_settings (
    dataset          TEXT        PRIMARY KEY REFERENCES public.datasets (slug) ON DELETE CASCADE,
    interval_minutes INTEGER     NOT NULL DEFAULT 60
                     CHECK (interval_minutes BETWEEN 5 AND 1440),
    enabled           BOOLEAN     NOT NULL DEFAULT true,
    demo_mode         BOOLEAN     NOT NULL DEFAULT false,
    last_run_at       TIMESTAMPTZ,
    next_run_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour'),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.processing_settings (dataset)
SELECT slug FROM public.datasets;

CREATE FUNCTION public.ensure_dataset_processing_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.processing_settings (dataset) VALUES (NEW.slug)
    ON CONFLICT (dataset) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER datasets_processing_settings_trigger
AFTER INSERT ON public.datasets
FOR EACH ROW EXECUTE FUNCTION public.ensure_dataset_processing_settings();
