# Prompts — FraudRadar PLD | RAG e LLM

Esta pasta documenta os prompts e as instruções de implementação da frente de **IA generativa**, incluindo o RAG jurídico e o assistente contextual dos alertas.

## Proveniência (importante para a banca e VibeLog)

- **ORIGINAL NO CÓDIGO**: transcrição fiel de mensagens montadas pelo código na branch `integration/oracle-vercel-final`, commit `abc3f3b` (17/11/2026). Os valores dinâmicos são representados por placeholders.
- **RECONSTRUÇÃO DOCUMENTAL**: prompt elaborado a partir de objetivos e etapas de implementação registrados nas conversas e no repositório. **Não é transcrição literal de uma mensagem histórica enviada a um agente.** Não deve ser contabilizado como prompt original no VibeLog.
- Para contagem de prompts efetivamente submetidos, usar logs originais do Claude Code/Codex/ChatGPT ou o VibeLog; a execução de testes e trechos de código não comprova o número de interações.

## Arquivos

| Arquivo | Tipo | Finalidade |
|---|---|---|
| `01-configurar-gemini.md` | Reconstrução | Integração inicial do Gemini e proteção das credenciais |
| `02-ingestao-juridica-versionada.md` | Reconstrução | Snapshot auditável da Lei 9.613/1998 |
| `03-busca-hibrida-rag.md` | Reconstrução | Embeddings, pgvector e recuperação lexical + semântica |
| `04-prompt-juridico-producao.md` | Original no código | System instruction e montagem da pergunta com evidências |
| `05-parecer-contextual-producao.md` | Original no código | Contexto financeiro e geração de parecer do alerta |
| `06-chat-contextual-producao.md` | Original no código | Prompt do chat do alerta |
| `07-testes-seguranca-rag.md` | Reconstrução | Testes de evidência, citações, privacidade e falhas |
| `08-deploy-oracle-rag-llm.md` | Reconstrução | Publicação da API na Oracle sem alterar DB/worker |
| `09-limites-e-proximas-melhorias.md` | Análise técnica | Pontos ainda não resolvidos e demonstráveis |

## Stack e parâmetros observados

- LLM: `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash-lite` na API Oracle após o deploy.
- Biblioteca: `google-genai`.
- Embeddings: `intfloat/multilingual-e5-small` (384 dimensões).
- RAG: PostgreSQL 17 + pgvector, snapshot da Lei 9.613/1998, busca híbrida lexical/vetorial.
- Geração jurídica: `temperature=0`, `max_output_tokens=700`.
- Recuperação na API: até 3 documentos e 5.000 caracteres para o contexto jurídico.
- Código em `src/fraudradar/ai/` e `api/alert_ai_service.py`, `api/alert_ai_context.py`, `api/routes/ai.py`.

## Segurança e uso

Não incluir chaves `.env`, credenciais Supabase, SSH, IDs de conta/transação ou dados de pessoas em prompts versionados. Não interpretar pontuação do LightGBM como prova de crime. O parecer é preliminar, com revisão humana; o RAG jurídico brasileiro não significa aplicabilidade automática a transações fora do Brasil.
