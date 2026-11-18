# 07 — Testes e segurança da IA

**Tipo:** RECONSTRUÇÃO DOCUMENTAL — não é mensagem literal recuperada.

## Prompt de implementação (reconstruído)

> Criar testes offline para o pipeline RAG e LLM do FraudRadar, sem chamadas reais ao Gemini e sem acesso ao banco Oracle. Cobrir ausência de fonte revisada, rejeição de citações inexistentes, referências sequenciais [F1] etc., limites de contexto, fontes oficiais, fallback do provedor, validação e persistência de parecer, autenticação e coerência entre ID do alerta na rota e no contexto. Validar que identificadores de contas e transações não sejam enviados ao modelo. Testar os endpoints de chat contextual e parecer com mocks e dependências substituídas. Garantir que alertas permaneçam sob decisão humana.

## Evidência

Commit `abc3f3b` adicionou testes `tests/test_alert_ai_context.py`, `test_alert_ai_service.py`, `test_alert_assessments.py`, `test_alert_assessment_rag_contract.py`, `test_alert_assessment_http.py`, `test_alert_chat_http.py`. A suíte offline de IA e RAG associada foi reportada com 88 testes aprovados no histórico da implementação.

## Limite da evidência

A integração de banco local não foi concluída porque o PostgreSQL 17 no Windows não possuía a extensão pgvector; isso não constitui aprovação de integração SQL local completa.
