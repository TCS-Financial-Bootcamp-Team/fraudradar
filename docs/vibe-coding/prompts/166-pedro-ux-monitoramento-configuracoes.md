---
id: 166
area: web
autor: Pedro
destino: Claude Code (conta 2), que delegou ao agy (Gemini 4 Neon)
data: 2026-11-19
---

# Ajustes de UX/UI no Monitoramento, Configurações e textos acadêmicos

Pedro pediu melhorias de frontend sem mudar regras de negócio, e que a tarefa fosse
delegada ao Gemini 4 Neon (agy), com quantas instâncias fossem necessárias:

1. **Monitoramento:** trocar indicadores vazios ("—", 0 sem contexto) por mensagens
   explicativas sem esconder valores válidos ("Aguardando decisões conclusivas dos analistas
   para calcular a precisão.", "Nenhuma conta da amostra de controle foi revisada até o
   momento."); explicar rótulos sem classificação conclusiva; estados vazios compactos nos
   gráficos; tooltips para precisão, taxa de alerta, recall, amostra de controle e rótulos;
   diferença entre alertas revisados e decisões conclusivas; melhor hierarquia e
   responsividade; manter as quebras por país e meio de pagamento (auditoria de viés).
2. **Textos acadêmicos e de demonstração:** remover "Projeto acadêmico", "Apenas para fins
   educacionais", "Protótipo", "Somente demonstração", "Projeto integrador" e semelhantes,
   com linguagem objetiva, mantendo limitações reais (por exemplo, "Envio externo não
   habilitado" para o COAF).
3. **Configurações:** descrições curtas nos campos de processamento; verificar o efeito real
   do `demo_mode` e, se não tiver nenhum, tirar a opção da tela mantendo a compatibilidade do
   backend; explicar melhor a amostra de controle e o processamento automático.
4. **Requisitos:** não mexer em LightGBM, processamento, API ou dados; não criar métricas
   fictícias; manter PT/EN; reusar componentes; responsivo e acessível; rodar testes e
   verificações.
