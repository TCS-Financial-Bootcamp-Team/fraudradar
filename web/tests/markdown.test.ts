import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../src/components/markdown";
import { parseInlines, parseMarkdown } from "../src/lib/markdown";

test("inlines: negrito, itálico e código inline", () => {
  assert.deepEqual(
    parseInlines("Texto **forte**, __sublinhado__, *ênfase*, _itálico_ e `fan_out()`."),
    [
      { type: "text", text: "Texto " },
      { type: "strong", children: [{ type: "text", text: "forte" }] },
      { type: "text", text: ", " },
      { type: "strong", children: [{ type: "text", text: "sublinhado" }] },
      { type: "text", text: ", " },
      { type: "emphasis", children: [{ type: "text", text: "ênfase" }] },
      { type: "text", text: ", " },
      { type: "emphasis", children: [{ type: "text", text: "itálico" }] },
      { type: "text", text: " e " },
      { type: "code", text: "fan_out()" },
      { type: "text", text: "." },
    ],
  );
});

test("inlines: palavras em snake_case não viram itálico", () => {
  assert.deepEqual(parseInlines("Tipologias fan_out e layered_fan_in em análise."), [
    { type: "text", text: "Tipologias fan_out e layered_fan_in em análise." },
  ]);
  assert.deepEqual(parseInlines("foo_bar_baz"), [
    { type: "text", text: "foo_bar_baz" },
  ]);
});

test("inlines: marcadores de citação como [F1] permanecem texto", () => {
  assert.deepEqual(parseInlines("Evidência principal [F1] e guia [2]."), [
    { type: "text", text: "Evidência principal [F1] e guia [2]." },
  ]);
});

test("inlines: apenas links https são convertidos; outros protocolos ficam texto", () => {
  assert.deepEqual(
    parseInlines(
      "Veja [norma](https://example.com/pld), [inseguro](http://example.com) e [xss](javascript:alert(1)).",
    ),
    [
      { type: "text", text: "Veja " },
      { type: "link", text: "norma", href: "https://example.com/pld" },
      {
        type: "text",
        text: ", [inseguro](http://example.com) e [xss](javascript:alert(1)).",
      },
    ],
  );
});

test("segurança: <script>alert(1)</script> permanece texto literal sem HTML ativo", () => {
  const payload = "<script>alert(1)</script>";
  assert.deepEqual(parseMarkdown(payload), [
    {
      type: "paragraph",
      children: [{ type: "text", text: payload }],
    },
  ]);

  const html = renderToStaticMarkup(createElement(Markdown, { content: payload }));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("blocos: títulos de # a ######, citação e linha horizontal", () => {
  const md = [
    "# Título 1",
    "### Subtítulo **importante**",
    "###### Nota final",
    "",
    "> Observação em destaque",
    "",
    "---",
    "***",
  ].join("\n");

  assert.deepEqual(parseMarkdown(md), [
    { type: "heading", level: 1, children: [{ type: "text", text: "Título 1" }] },
    {
      type: "heading",
      level: 3,
      children: [
        { type: "text", text: "Subtítulo " },
        { type: "strong", children: [{ type: "text", text: "importante" }] },
      ],
    },
    { type: "heading", level: 6, children: [{ type: "text", text: "Nota final" }] },
    {
      type: "blockquote",
      blocks: [
        {
          type: "paragraph",
          children: [{ type: "text", text: "Observação em destaque" }],
        },
      ],
    },
    { type: "hr" },
    { type: "hr" },
  ]);
});

test("blocos: listas não ordenadas com * e - e item aninhado", () => {
  const md = [
    "* Primeiro ponto",
    "  - Subitem A",
    "  * Subitem B",
    "- Segundo ponto",
  ].join("\n");

  assert.deepEqual(parseMarkdown(md), [
    {
      type: "list",
      ordered: false,
      items: [
        {
          children: [{ type: "text", text: "Primeiro ponto" }],
          sublist: {
            type: "list",
            ordered: false,
            items: [
              { children: [{ type: "text", text: "Subitem A" }] },
              { children: [{ type: "text", text: "Subitem B" }] },
            ],
          },
        },
        { children: [{ type: "text", text: "Segundo ponto" }] },
      ],
    },
  ]);
});

test("blocos: listas ordenadas com 1. e 1)", () => {
  const md = ["1. Primeira etapa", "2. Segunda etapa"].join("\n");
  assert.deepEqual(parseMarkdown(md), [
    {
      type: "list",
      ordered: true,
      items: [
        { children: [{ type: "text", text: "Primeira etapa" }] },
        { children: [{ type: "text", text: "Segunda etapa" }] },
      ],
    },
  ]);

  const mdParen = ["1) Conferir origem", "2) Conferir destino"].join("\n");
  assert.deepEqual(parseMarkdown(mdParen), [
    {
      type: "list",
      ordered: true,
      items: [
        { children: [{ type: "text", text: "Conferir origem" }] },
        { children: [{ type: "text", text: "Conferir destino" }] },
      ],
    },
  ]);
});

test("blocos: linha em branco separa parágrafos e quebra simples vira <br>", () => {
  const md = "Linha um\nLinha dois\n\nSegundo parágrafo";
  assert.deepEqual(parseMarkdown(md), [
    {
      type: "paragraph",
      children: [
        { type: "text", text: "Linha um" },
        { type: "break" },
        { type: "text", text: "Linha dois" },
      ],
    },
    {
      type: "paragraph",
      children: [{ type: "text", text: "Segundo parágrafo" }],
    },
  ]);

  const html = renderToStaticMarkup(
    createElement(Markdown, {
      content: "Veja [guia](https://example.com) e linha1\nlinha2",
      className: "text-[13px]",
    }),
  );
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes("<br/>"));
  assert.ok(html.includes("text-[13px]"));
});
