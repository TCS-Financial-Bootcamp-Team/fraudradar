---
id: 167
area: web
autor: Claude Code (conta 2, do Pedro)
destino: agy (Antigravity CLI, Gemini 4 Neon (High)), três instâncias
pai: 166
data: 2026-11-19
---

# Delegação dos ajustes de UX/UI em três instâncias do Gemini 4 Neon

A IA dividiu o pedido 166 em três prompts para o agy, na branch `feat/ux-monitoring-settings`,
sem commit nem push, cada um com escopo de arquivos próprio:

1. **Monitoramento** (`alerts/components/monitoring.tsx`, `charts.tsx`, `feedback/`, chaves de
   `alerts.json`): estados vazios explicativos, `ChartEmptyState`, `InfoTooltip` acessível em
   `web/src/components/ui/info-tooltip.tsx`, diferença entre revisados e conclusivos, quebras por
   país e meio de pagamento mantidas.
2. **Configurações** (`processing/`, `settings/`, `processing.json`): descrições dos campos,
   amostra de controle e processamento automático. O `demo_mode` tem efeito real (mostra o botão
   "Simular transações" em Fontes de dados, `processing-controls.tsx`), por isso ficou, renomeado
   para "Exibir simulador de transações em Fontes de dados".
3. **Textos acadêmicos** (todo o `web/`), rodado depois dos dois primeiros: "simulação acadêmica"
   virou "Envio externo não habilitado", o banner do modo com mocks virou "Modo offline", as chaves
   `models.feedback` sem uso saíram, o KPI de precisão da Visão Geral ganhou o mesmo estado vazio e
   os testes `feedback.test.ts` e `dashboard.test.ts` foram atualizados.

Depois, a IA reescreveu os tooltips do Monitoramento sem nomes de tabelas e colunas (linguagem de
negócio, nos dois idiomas) e rodou `pnpm lint`, `tsc --noEmit`, `pnpm test` (125/125) e
`pnpm build`, todos verdes.

Em aberto para o time: o checkbox de ciência no cadastro não é obrigatório no formulário; os
números fixos da tela de login (9,5 mi, 14 semanas, 300); e `POST /datasets/{slug}/simulate` não
confere o `demo_mode` no servidor.
