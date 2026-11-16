import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_LOCALE, LOCALES, resolveLocale } from "../src/i18n/config";
import { getT } from "../src/i18n/runtime";
import { formatCurrency, formatNumber, formatShortDate } from "../src/lib/format";

// O teste roda com a pasta `web` como diretório atual (scripts/run-tests.mjs).
const messagesDir = join(process.cwd(), "messages");
const SOURCE = "pt-BR";
const OTHERS = LOCALES.filter((locale) => locale !== SOURCE);

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function load(locale: string): Map<string, string> {
  const dir = join(messagesDir, locale);
  const all = new Map<string, string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const tree = JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree;
    for (const [key, value] of flatten(tree, file.replace(/\.json$/, ""))) {
      all.set(key, value);
    }
  }
  return all;
}

// Argumentos ICU de uma mensagem: `{name}`, `{n, plural, ...}`, `{x, select, ...}`, inclusive
// os aninhados dentro das ramificações. Devolve os nomes dos argumentos, ordenados: um idioma
// pode usar `{n}` onde o outro usa plural (`{n, plural, ...}`) sobre o mesmo argumento.
export function icuArguments(message: string): string[] {
  const found = new Set<string>();
  const scan = (text: string) => {
    let i = 0;
    while (i < text.length) {
      if (text[i] === "'" && text[i + 1] === "{") {
        // texto escapado: '{' vira chave literal
        i += 2;
        continue;
      }
      if (text[i] !== "{") {
        i++;
        continue;
      }
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(i + 1, j - 1);
      const head = /^\s*([A-Za-z_][\w]*)\s*(?:,\s*(\w+))?/.exec(body);
      if (head) {
        found.add(head[1]);
        // plural/select: cada ramificação `{...}` é uma mensagem com argumentos próprios
        if (["plural", "select", "selectordinal"].includes(head[2] ?? "")) {
          const rest = body.slice(head[0].length);
          let k = 0;
          while (k < rest.length) {
            if (rest[k] !== "{") {
              k++;
              continue;
            }
            let d = 1;
            let m = k + 1;
            while (m < rest.length && d > 0) {
              if (rest[m] === "{") d++;
              else if (rest[m] === "}") d--;
              m++;
            }
            scan(rest.slice(k + 1, m - 1));
            k = m;
          }
        }
      } else {
        scan(body);
      }
      i = j;
    }
  };
  scan(message);
  return [...found].sort();
}

const source = load(SOURCE);

test("idiomas: todo módulo existe nos dois idiomas", () => {
  const modules = (locale: string) =>
    readdirSync(join(messagesDir, locale)).sort();
  for (const locale of OTHERS) {
    assert.deepEqual(modules(locale), modules(SOURCE), `módulos de ${locale}`);
  }
});

for (const locale of OTHERS) {
  test(`mensagens ${locale}: mesmas chaves que ${SOURCE}`, () => {
    const other = load(locale);
    const missing = [...source.keys()].filter((key) => !other.has(key));
    const extra = [...other.keys()].filter((key) => !source.has(key));
    assert.deepEqual(missing, [], `faltam em ${locale}`);
    assert.deepEqual(extra, [], `sobram em ${locale}`);
  });

  test(`mensagens ${locale}: mesmos marcadores ICU que ${SOURCE}`, () => {
    const other = load(locale);
    const different: string[] = [];
    for (const [key, text] of source) {
      const translated = other.get(key);
      if (translated === undefined) continue;
      if (
        JSON.stringify(icuArguments(text)) !==
        JSON.stringify(icuArguments(translated))
      ) {
        different.push(key);
      }
    }
    assert.deepEqual(different, []);
  });

  test(`mensagens ${locale}: nenhuma vazia`, () => {
    const empty = [...load(locale)].filter(([, v]) => !v.trim()).map(([k]) => k);
    assert.deepEqual(empty, []);
  });
}

test("marcadores ICU: o extrator enxerga argumento simples, plural e aninhado", () => {
  assert.deepEqual(icuArguments("Olá, {name}"), ["name"]);
  assert.deepEqual(
    icuArguments("{count, plural, =1 {# alerta de {kind}} other {# alertas}}"),
    ["count", "kind"],
  );
  assert.deepEqual(icuArguments("sem marcador"), []);
});

test("idioma: cookie ausente ou inválido cai em pt-BR", () => {
  assert.equal(DEFAULT_LOCALE, "pt-BR");
  assert.equal(resolveLocale(undefined), "pt-BR");
  assert.equal(resolveLocale(null), "pt-BR");
  assert.equal(resolveLocale("fr"), "pt-BR");
  assert.equal(resolveLocale("EN"), "pt-BR");
  assert.equal(resolveLocale("en"), "en");
  assert.equal(resolveLocale("pt-BR"), "pt-BR");
});

test("tradutor fora do React: vale o idioma pedido e o padrão é pt-BR", () => {
  assert.equal(getT("common.language")("label"), "Idioma");
  assert.equal(getT("common.language", "en")("label"), "Language");
});

test("formatação segue o idioma e a moeda continua libra", () => {
  assert.equal(formatNumber(1234.5), "1.234,5");
  assert.equal(formatNumber(1234.5, "en"), "1,234.5");
  assert.match(formatCurrency(1500), /£\s?1\.500/);
  assert.equal(formatCurrency(1500, "en"), "£1,500");
  assert.equal(formatShortDate("2023-05-07", "pt-BR"), "07/05/2023");
  assert.equal(formatShortDate("2023-05-07", "en"), "5/7/2023");
});
