# 01 — Configuração do Gemini

**Tipo:** RECONSTRUÇÃO DOCUMENTAL — não é mensagem literal recuperada.

## Prompt de implementação (reconstruído)

> Integrar ao FraudRadar um provedor de LLM configurável por variáveis de ambiente, iniciando pelo Google Gemini no plano gratuito. Usar `LLM_PROVIDER=gemini`, `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) e `LLM_MODEL`, com seleção explícita do modelo e validação de configuração. Não enviar credenciais ao repositório e não exibir chaves em logs. Executar primeiro um teste isolado de resposta em português com baixo limite de tokens, antes de conectar banco, RAG ou frontend. Entregar comandos completos, testes e logs sem segredos.

## Evidência histórica

Um teste inicial do Gemini foi realizado com situação fictícia de 12 transferências semelhantes; solicitou resposta breve em português, sem afirmar a ocorrência de crime, com `temperature=0.2` e `max_output_tokens=120`. A redação literal dessa mensagem não está recuperada neste pacote.

## Implementação observada

O serviço jurídico usa `google.genai.Client`, lê variáveis por `get_settings()`, exige Gemini configurado e fecha o cliente ao terminar. A Oracle foi validada com `gemini-3.5-flash-lite`; esse valor não é a garantia de disponibilidade futura do provedor.
