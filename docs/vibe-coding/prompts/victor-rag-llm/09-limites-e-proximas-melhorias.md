# 09 — Limitações atuais e próximos incrementos

**Tipo:** ANÁLISE TÉCNICA, não representa prompt histórico original.

## Limites observados

1. O chat contextual recebe o resumo financeiro, mas encaminha a resposta ao gerador jurídico (`answer_legal_chat`); pode priorizar a lei em vez de explicar os sinais LightGBM.
2. Perguntas sobre outra conta não são automaticamente resolvidas por pesquisa global: a rota `/alerts/{alert_id}/chat` trabalha com o alerta selecionado.
3. O RAG implementado está centrado na Lei 9.613/1998 (Brasil). Para alertas do Reino Unido, não afirmar que a norma brasileira é automaticamente aplicável.
4. Pode haver Markdown escapado ou apresentação irregular das fontes na interface; separar dados do corpo da resposta da formatação de exibição.
5. Fontes citadas podem ser genericamente relevantes e não sustentar uma afirmação particular; revisar ranking e validação sem inventar suporte jurídico.
6. Scores e contribuições SHAP são indícios e explicações do modelo, não comprovação de lavagem de dinheiro.
7. Os dados SAML-D são sintéticos; testes em produção com dados reais de instituições não foram realizados.

## Sugestão de prompt futuro (NÃO EXECUTADO)

> Ajustar o assistente contextual para responder primeiro com fatos verificáveis do alerta (score, janela, quantidades, volume, contribuições do LightGBM e regras), diferenciar indicador de suspeita de conclusão jurídica, e usar RAG legal apenas quando pertinente. Se a pergunta referir outra conta, esclarecer o escopo ou consultar uma rota apropriada com controle de acesso. Validar juridição, ranking das fontes e Markdown de exibição. Acrescentar testes de regressão, privacidade e auditoria sem alterar decisões humanas.
