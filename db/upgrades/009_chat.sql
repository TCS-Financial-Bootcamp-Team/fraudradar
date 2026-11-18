-- Histórico de conversas do assistente global: leva um banco que JÁ EXISTE para o esquema
-- novo, sem apagar nada. Fica fora de db/init de propósito: nunca roda na criação do volume, que
-- já nasce com este esquema (006_chat.sql).
--
--   docker compose exec -T db psql -U fraudradar -d fraudradar -v ON_ERROR_STOP=1 \
--     < db/upgrades/009_chat.sql
--
-- Pode rodar mais de uma vez: cria as tabelas e índices somente se ainda faltarem.

BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dataset    TEXT        NOT NULL REFERENCES public.datasets (slug) ON DELETE CASCADE,
    owner_id   TEXT        NOT NULL CHECK (length(btrim(owner_id)) > 0),
    title      TEXT        NOT NULL CHECK (length(btrim(title)) > 0 AND char_length(title) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_conversations_owner_dataset_updated_idx
    ON public.chat_conversations (owner_id, dataset, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES public.chat_conversations (id) ON DELETE CASCADE,
    role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 16000),
    kind            TEXT,
    sources         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    links           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    model           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_idx
    ON public.chat_messages (conversation_id, id);

COMMIT;
