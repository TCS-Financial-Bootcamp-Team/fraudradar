# 03 — Recuperação híbrida jurídica

**Tipo:** RECONSTRUÇÃO DOCUMENTAL — não é mensagem literal recuperada.

## Prompt de implementação (reconstruído)

> Implementar recuperação híbrida de evidências jurídicas em português no FraudRadar usando embeddings `intfloat/multilingual-e5-small` (384 dimensões) no PostgreSQL/pgvector, combinando similaridade vetorial e correspondência lexical por conceitos. Quando houver referência explícita a artigo, elevar a prioridade da correspondência exata. Filtrar pelo `source_id`, hash do snapshot e apenas documentos `reviewed` para produção. Limitar as evidências encaminhadas ao Gemini e retornar identificadores sequenciais [F1], [F2], [F3], com conteúdo integral do trecho e URL da fonte oficial. Recuperar dados dentro de transação curta e chamar LLM somente depois de fechar a conexão.

## Implementação observada

- `src/fraudradar/ai/legal_hybrid.py`: pontuação experimental `0.65 * cobertura_lexical + 0.35 * similaridade_semântica + 2.0 * correspondência_exata_do_artigo`.
- `api/legal_chat_service.py`: até 3 documentos e 5.000 caracteres, somente revisados.
- `src/fraudradar/ai/legal_retrieval.py`: prepara as evidências antes de gerar resposta.

A fórmula de ranking é uma escolha experimental, não uma métrica de relevância jurídica validada externamente.
