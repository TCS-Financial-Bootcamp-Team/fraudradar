# rag/

Base do chat jurídico (`POST /chat`). Os textos viram trechos com embedding de 384 dimensões em
`rag_documents`.

- `sources.json`: catálogo das fontes oficiais (título, órgão, endereço e data de publicação).
- `snapshots/`: o texto de uma fonte numa data, artigo por artigo. Cada snapshot traz:
  - o hash de cada artigo e o do texto inteiro;
  - o status da revisão (`pending_review` ou `reviewed`).

O chat só usa:

- trechos de snapshot `reviewed`;
- o snapshot da Lei 9.613 que está na pasta (`api/legal_chat_service.py`).

Por isso a pasta guarda um snapshot da lei por vez.

## Como carregar

```bash
docker compose run --rm worker rag-load     # pelo Docker
uv run python -m worker rag-load            # pela máquina (usa o DATABASE_URL do .env)
```

O comando confere os hashes, divide os artigos e grava tudo ou nada.

Rodar de novo não duplica nada:

- o snapshot igual ao da base fica como está;
- o snapshot que mudou é gravado de novo, por exemplo quando o status passa de `pending_review` a
  `reviewed`.

Numa versão nova do texto, os trechos da antiga ficam na base, mas o chat filtra pelo hash do
snapshot da pasta.

A primeira carga baixa o modelo de embeddings (`EMBEDDING_MODEL`, uns 470 MB). No Docker, ele
fica no volume `hf-cache`, que a API também usa. Assim, a primeira pergunta ao chat não baixa o
modelo de novo.

## Fontes

| Fonte | Estado |
|---|---|
| Lei 9.613/1998 (lavagem de dinheiro, texto compilado) | snapshot revisado em `snapshots/` |
| Circular BCB 3.978/2020 (política e controles de PLD/FT) | no `sources.json`, ainda sem snapshot |
| As 28 tipologias do SAML-D (11 normais e 17 suspeitas, segundo o artigo do dataset) | a coletar |
| Manual interno (critérios de arquivar, aprofundar e comunicar; modelo de comunicação ao COAF) | a coletar |
