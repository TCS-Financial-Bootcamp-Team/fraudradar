---
id: 128
area: frontend
autor: agy (Antigravity CLI, gemini-4-hydrogen-high)
destino: Claude Code (conta 2, do Pedro)
pai: 127
data: 2026-11-17
tipo: resposta
---

# Resultado da delegação 127: markdown do parecer e do assistente

## O que mudou

- `web/src/lib/markdown.ts`: um leitor de markdown sem dependência nova, que monta uma árvore de
  blocos e trechos, testável sem React.
  - Blocos: parágrafo (uma linha em branco separa; uma quebra simples vira quebra de linha),
    títulos `#` a `######`, listas com `-`, `*`, `+`, `•` e um nível de recuo, listas numeradas
    `1.` e `1)`, citação `>` e linha horizontal.
  - Trechos: negrito, itálico, código e links `https`.
  - Fica como texto: o `_` no meio de palavra (`fan_out`), `[F1]`, HTML (`<script>`) e link que não
    é `https`.
- `web/src/components/markdown.tsx`: desenha a árvore só com nós de texto do React, sem HTML bruto.
  Links abrem em outra aba com `rel="noopener noreferrer"`.
- O card do parecer (`alert-detail.tsx`) e as respostas do assistente (`assistant.tsx`, no chat e
  na gaveta) usam o componente. A mensagem do analista continua texto puro. Saiu o
  `FormattedContent`, que só entendia `**negrito**` e `- item`.
- O parecer de demonstração (`alerts-service.ts`, modo com dados simulados) ganhou negrito e uma
  lista, para a formatação aparecer na demo.
- `web/tests/markdown.test.ts`: 9 testes.

## Verificação

Do agy, repetida pelo Claude: `pnpm lint` passou, `pnpm test` deu 93 de 93 e `pnpm build` passou.

## Limites

- O leitor percorre o texto de novo para cada `*` sem par. Um texto com milhares de asteriscos
  soltos ficaria lento. O parecer tem no máximo 20 mil caracteres e vem do Gemini, então não
  vale complicar.
- Ninguém olhou a tela num navegador. Tabelas em markdown continuam texto: o leitor não as entende.
