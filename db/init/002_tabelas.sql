-- Esquema do FraudRadar PLD. Roda uma vez, quando o volume do Postgres é criado.
-- Datas do SAML-D não têm fuso: data_hora e semana ficam sem timezone.
-- `semana` é sempre a segunda-feira da semana.

-- Transações do SAML-D (~9,5 mi linhas), carregadas por COPY.
-- Sem FK para contas: contas é derivada de transacoes e a FK deixaria a carga lenta.
-- ingestao_id: o envio pela API que trouxe a transação; NULL na carga do SAML-D. Também sem
-- FK, pelo mesmo motivo (o gatilho rodaria a cada linha do COPY): a API grava os dois juntos.
CREATE TABLE transacoes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_hora       TIMESTAMP     NOT NULL,
    remetente       BIGINT        NOT NULL,
    recebedor       BIGINT        NOT NULL,
    valor           NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
    moeda_pagamento TEXT          NOT NULL,
    moeda_recebida  TEXT          NOT NULL,
    pais_remetente  TEXT          NOT NULL,
    pais_recebedor  TEXT          NOT NULL,
    tipo_pagamento  TEXT          NOT NULL,
    ingestao_id     BIGINT
);
CREATE INDEX transacoes_remetente_data_idx ON transacoes (remetente, data_hora);
CREATE INDEX transacoes_recebedor_data_idx ON transacoes (recebedor, data_hora);

-- Um registro por envio à API (POST /ingestao/csv e /ingestao/transacoes); o id é o do
-- recibo. status: recebido (gravado, ainda sem score) -> processando -> concluido, avançado
-- pelo worker quando processar as semanas das transações do envio.
CREATE TABLE ingestoes (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origem       TEXT        NOT NULL CHECK (origem IN ('csv', 'manual')),
    nome_arquivo TEXT,
    linhas       INTEGER     NOT NULL CHECK (linhas > 0),
    status       TEXT        NOT NULL DEFAULT 'recebido'
                 CHECK (status IN ('recebido', 'processando', 'concluido')),
    quem         TEXT        NOT NULL CHECK (length(btrim(quem)) > 0),
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gabarito, separado de propósito: o modelo NUNCA lê esta tabela.
CREATE TABLE avaliacao (
    transacao_id       BIGINT   PRIMARY KEY REFERENCES transacoes (id) ON DELETE CASCADE,
    rotulo             SMALLINT NOT NULL CHECK (rotulo IN (0, 1)),
    tipologia_original TEXT     NOT NULL,
    tipologia          TEXT     NOT NULL
);

-- Contas sem país fixo (o país vem de cada transação).
CREATE TABLE contas (
    conta         BIGINT      PRIMARY KEY,
    primeira_data TIMESTAMP   NOT NULL,
    ultima_data   TIMESTAMP   NOT NULL,
    segmento      SMALLINT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ultima_data >= primeira_data)
);

CREATE TABLE modelo_versoes (
    versao    TEXT        PRIMARY KEY,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    features  JSONB       NOT NULL,
    limiar    REAL        NOT NULL CHECK (limiar BETWEEN 0 AND 1),
    metricas  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ativa     BOOLEAN     NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX modelo_versoes_uma_ativa_idx ON modelo_versoes (ativa) WHERE ativa;

CREATE TABLE scores_transacao (
    transacao_id  BIGINT      NOT NULL REFERENCES transacoes (id) ON DELETE CASCADE,
    modelo_versao TEXT        NOT NULL REFERENCES modelo_versoes (versao),
    score         REAL        NOT NULL CHECK (score BETWEEN 0 AND 1),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (transacao_id, modelo_versao)
);

-- Um lote por semana processada pelo worker. `liberada_em` é o replay da demo:
-- a API libera uma semana por vez (POST /replay/proxima-semana).
-- metricas é a avaliação contra `avaliacao`, calculada pelo worker:
--   {"recall": 0..1, "acerto_tipologia": 0..1,
--    "taxa_paises": {"UK": 0..1, ...}, "taxa_meios": {"Cash Deposit": 0..1, ...}}
CREATE TABLE lotes_semana (
    semana        DATE        PRIMARY KEY CHECK (extract(isodow FROM semana) = 1),
    modelo_versao TEXT        NOT NULL REFERENCES modelo_versoes (versao),
    contas_ativas INTEGER     NOT NULL CHECK (contas_ativas >= 0),
    metricas      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    processado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    liberada_em   TIMESTAMPTZ
);

-- Fila semanal por conta, escrita pelo worker. `paises` vem ordenado pelo valor
-- movimentado (paises[1] é o país exibido na fila); `tipologia` é a prevista
-- pelo modelo, nunca a de `avaliacao`; valor_total e qtd_transacoes resumem as
-- transações da conta na semana, enviadas e recebidas.
CREATE TABLE alertas (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conta          BIGINT        NOT NULL REFERENCES contas (conta),
    semana         DATE          NOT NULL CHECK (extract(isodow FROM semana) = 1),
    score          REAL          NOT NULL CHECK (score BETWEEN 0 AND 1),
    posicao_fila   INTEGER       NOT NULL CHECK (posicao_fila > 0),
    status         TEXT          NOT NULL DEFAULT 'novo'
                   CHECK (status IN ('novo', 'em_analise', 'arquivado', 'aprofundado', 'comunicado')),
    paises         TEXT[]        NOT NULL DEFAULT '{}',
    tipologia      TEXT,
    valor_total    NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
    qtd_transacoes INTEGER       NOT NULL DEFAULT 0 CHECK (qtd_transacoes >= 0),
    modelo_versao  TEXT          NOT NULL REFERENCES modelo_versoes (versao),
    criado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (conta, semana)
);
CREATE INDEX alertas_fila_idx ON alertas (semana, status, posicao_fila);
CREATE INDEX alertas_paises_idx ON alertas USING gin (paises);

-- contribuicoes: {"<feature>": contribuição SHAP em log-odds} (positiva = puxa para suspeito).
-- regras: [{"codigo": "R-001", "descricao": "...", "detalhe": {...}}], ver db/regras/.
CREATE TABLE evidencias (
    alerta_id      BIGINT      PRIMARY KEY REFERENCES alertas (id) ON DELETE CASCADE,
    contribuicoes  JSONB       NOT NULL DEFAULT '{}'::jsonb,
    regras         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    sinais_semanais JSONB      NOT NULL DEFAULT '{}'::jsonb,
    grafo          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- fontes: [{"titulo": "...", "trecho": "..."}], na ordem das citações [1], [2]...
CREATE TABLE pareceres (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alerta_id          BIGINT      NOT NULL REFERENCES alertas (id) ON DELETE CASCADE,
    texto              TEXT        NOT NULL,
    tipologia_sugerida TEXT,
    fontes             JSONB       NOT NULL DEFAULT '[]'::jsonb,
    validacao          JSONB       NOT NULL DEFAULT '{}'::jsonb,
    valido             BOOLEAN,
    modelo_llm         TEXT,
    criado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pareceres_alerta_idx ON pareceres (alerta_id, criado_em DESC);

CREATE TABLE decisoes (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alerta_id     BIGINT      NOT NULL REFERENCES alertas (id) ON DELETE CASCADE,
    parecer_id    BIGINT      REFERENCES pareceres (id),
    analista      TEXT        NOT NULL CHECK (length(btrim(analista)) > 0),
    decisao       TEXT        NOT NULL CHECK (decisao IN ('arquivar', 'aprofundar', 'comunicar')),
    justificativa TEXT        NOT NULL CHECK (length(btrim(justificativa)) > 0),
    decidido_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX decisoes_alerta_idx ON decisoes (alerta_id, decidido_em DESC);

CREATE TABLE comunicacoes (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alerta_id    BIGINT      NOT NULL REFERENCES alertas (id) ON DELETE CASCADE,
    decisao_id   BIGINT      NOT NULL REFERENCES decisoes (id),
    rascunho     TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovada')),
    aprovado_por TEXT,
    aprovado_em  TIMESTAMPTZ,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'aprovada' OR (aprovado_por IS NOT NULL AND aprovado_em IS NOT NULL))
);

-- 384 dimensões: embedding multilíngue pequeno (multilingual-e5-small / MiniLM).
CREATE TABLE documentos_rag (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fonte        TEXT        NOT NULL,
    trecho_ordem INTEGER     NOT NULL,
    texto        TEXT        NOT NULL,
    metadados    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    embedding    vector(384) NOT NULL,
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fonte, trecho_ordem)
);
CREATE INDEX documentos_rag_embedding_idx ON documentos_rag USING hnsw (embedding vector_cosine_ops);

CREATE TABLE auditoria (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quem       TEXT        NOT NULL,
    acao       TEXT        NOT NULL,
    entidade   TEXT,
    entidade_id TEXT,
    detalhes   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    quando     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_quando_idx ON auditoria (quando DESC);
