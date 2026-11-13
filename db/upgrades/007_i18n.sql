-- Troca de idioma do front: leva um banco que JÁ EXISTE para o esquema novo, sem apagar nada.
-- Fica fora de db/init de propósito: nunca roda na criação do volume, que já nasce com este
-- esquema (003_platform.sql).
--
--   docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
--     < db/upgrades/007_i18n.sql
--
-- Pode rodar mais de uma vez: cada passo só age no que ainda falta. Só toca em `public.jobs`
-- (trabalhos são globais, não por conjunto).

BEGIN;

-- Código estável e parâmetros da mensagem do trabalho. O front traduz por eles; `message` segue
-- com o texto em português e vale quando o código é nulo (trabalhos antigos) ou desconhecido.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS message_code TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS message_params JSONB;

COMMIT;
