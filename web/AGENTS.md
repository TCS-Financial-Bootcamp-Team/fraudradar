<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Idioma (PT-BR e inglês)

PT-BR é o idioma padrão e a fonte das traduções; **todo texto de tela novo entra nos dois
arquivos de mensagens** (`web/messages/pt-BR/<módulo>.json` e `web/messages/en/<módulo>.json`).
`next-intl` sem idioma na URL: o idioma vem do cookie `NEXT_LOCALE` (1 ano, `/`, `SameSite=Lax`),
cookie ausente ou inválido vale `pt-BR`, e o `<html lang>` do `app/layout.tsx` o acompanha. O
seletor "PT | EN" é `src/i18n/locale-switcher.tsx` (cabeçalho, login/cadastro e Configurações >
Aparência).

- **Mensagens**: um JSON por módulo e idioma (`common`, `shell`, `auth`, `accounts`, `alerts`,
  `assistant`, `datasets`, `health`, `ingestion`, `jobs`, `models`, `processing`, `settings`,
  `errors`). As chaves são tipadas a partir do pt-BR: chave que falta ou está errada falha no
  `pnpm build`. `tests/i18n-messages.test.ts` falha se uma chave existe num idioma e no outro não,
  ou se um marcador ICU (`{nome}`, plural) difere.
- **Como acrescentar uma chave**: escreva em `pt-BR/<módulo>.json`, traduza em `en/<módulo>.json`
  (vocabulário em inglês: coluna "EN (tela)" de `docs/glossary.md`) e use `useTranslations("<módulo>.<grupo>")`
  no componente (`getTranslations` no servidor). Plural: `{n, plural, =1 {# alerta} other {# alertas}}`.
- **Fora do React** (serviços, `notify`): `getT("<módulo>")` de `src/i18n/runtime.ts`, que lê o idioma de
  `<html lang>`. Número, moeda (sempre GBP), percentual e data: `useFormatters()` (componentes) ou as
  funções de `src/lib/format.ts`, que recebem o idioma.
- **Mensagem de validação (zod)**: o schema guarda a chave (`v("nome")`, `src/i18n/validation.ts`, texto em
  `errors.validation`) e quem mostra o erro traduz (`Field` já faz; `useValidationText()` nos outros casos).
- **Mensagem do servidor**: erro de API e mensagem de trabalho chegam com `code` + `params`; o texto fica em
  `errors.api` (chave = código com `.` trocado por `_`). `src/i18n/server-messages.ts` traduz e, para código
  desconhecido, mostra o texto em português que o servidor mandou.
- **Nunca traduzido**: o que a pessoa digitou (justificativa, anotações), valores de dados (contas, países,
  meios de pagamento, códigos de tipologia, colunas do SAML-D), o texto do relato ao COAF (documento
  regulatório brasileiro: sempre em português; no modo inglês o rótulo diz "COAF report (in Portuguese)"), o
  conteúdo do parecer e do chat da IA e os logs do servidor.
- Os testes do front rodam no idioma padrão (pt-BR): `getT`/`format*` sem idioma valem pt-BR.

## Visual

Toda tela nova ou alterada segue `web/DESIGN.md`: tokens do tema (nunca cor fixa), tipografia,
moldura, cartões, tabelas e gráficos. Os temas vivem em `src/lib/theme` e `src/components/theme`;
notificações só por `notify` (`src/lib/notify.ts`).
