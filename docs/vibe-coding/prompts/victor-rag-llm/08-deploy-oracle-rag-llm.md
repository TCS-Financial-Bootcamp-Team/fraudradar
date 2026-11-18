# 08 — Deploy da API com RAG e Gemini na Oracle

**Tipo:** RECONSTRUÇÃO DOCUMENTAL — não é mensagem literal recuperada.

## Prompt de implementação (reconstruído)

> Publicar a versão da API do FraudRadar que implementa `/alerts/{alert_id}/assessment` e `/alerts/{alert_id}/chat` na VM Oracle, preservando o PostgreSQL/pgvector, o worker LightGBM e os volumes históricos. Construir a imagem em worktree Git isolada a partir do commit validado, conferir imports e testes, identificar os arquivos Compose efetivos, fazer backup da configuração e recriar exclusivamente a API com `--no-deps --no-build`. Preservar credenciais existentes, não exibir `.env` nem senha do banco, conferir healthcheck e OpenAPI, e oferecer rollback automático para a imagem anterior em caso de falha.

## Registro técnico

- Branch: `integration/oracle-vercel-final`
- Commit: `abc3f3b9e7531ee1842962e458c86b073ec7c081`
- Imagem publicada: `fraudradar-api:ai-abc3f3b`
- Imagem anterior: `fraudradar-api:integration-1fd3b833`
- Publicação da API confirmou `/health` HTTP 200 e rotas `/chat`, `/alerts/{alert_id}/assessment` e `/alerts/{alert_id}/chat` no OpenAPI; banco e worker foram preservados.
- Não incluir IP de VM, chaves ou senhas no histórico de prompts público quando não forem essenciais à reprodutibilidade.
