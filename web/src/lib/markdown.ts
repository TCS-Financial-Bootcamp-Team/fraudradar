export type InlineNode =
  | { type: "text"; text: string }
  | { type: "break" }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export interface ListItem {
  children: InlineNode[];
  sublist?: ListBlock;
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

export type BlockNode =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | ListBlock
  | { type: "blockquote"; blocks: BlockNode[] }
  | { type: "hr" };

const HR_RE = /^ {0,3}(?:-{3,}|\*{3,})\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.+?)\s*$/;
const BLOCKQUOTE_RE = /^ {0,3}>\s?(.*)$/;
const UNORDERED_ITEM_RE = /^([ \t]*)[-*+•][ \t]+(.*)$/;
const ORDERED_ITEM_RE = /^([ \t]*)\d+[.)][ \t]+(.*)$/;
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;
const ESCAPABLE_RE = /[\\*_`[\]()]/;

function isWordChar(ch: string): boolean {
  return ch !== "" && WORD_CHAR_RE.test(ch);
}

function isBlank(line: string): boolean {
  return /^\s*$/.test(line);
}

function measureIndent(whitespace: string): number {
  return whitespace.replace(/\t/g, "  ").length;
}

interface MatchedListItem {
  indent: number;
  ordered: boolean;
  text: string;
}

function matchListItem(line: string): MatchedListItem | null {
  const unordered = UNORDERED_ITEM_RE.exec(line);
  if (unordered) {
    return {
      indent: measureIndent(unordered[1]),
      ordered: false,
      text: unordered[2],
    };
  }
  const ordered = ORDERED_ITEM_RE.exec(line);
  if (ordered) {
    return {
      indent: measureIndent(ordered[1]),
      ordered: true,
      text: ordered[2],
    };
  }
  return null;
}

function isBlockStart(line: string): boolean {
  return (
    HR_RE.test(line) ||
    HEADING_RE.test(line) ||
    BLOCKQUOTE_RE.test(line) ||
    matchListItem(line) !== null
  );
}

function isSafeHttpsUrl(href: string): boolean {
  if (!/^https:\/\//i.test(href) || /\s/.test(href)) return false;
  try {
    const parsed = new URL(href);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function findInlineCodeClose(input: string, from: number, tickCount: number): number {
  let i = from;
  while (i < input.length) {
    if (input[i] === "`") {
      let run = 0;
      while (i + run < input.length && input[i + run] === "`") run++;
      if (run === tickCount) return i;
      i += run;
      continue;
    }
    i++;
  }
  return -1;
}

function tryParseLink(
  input: string,
  start: number,
): { text: string; href: string; nextIndex: number } | null {
  let closeBracket = -1;
  for (let i = start + 1; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n" || ch === "[") return null;
    if (ch === "\\" && i + 1 < input.length) {
      i++;
      continue;
    }
    if (ch === "]") {
      closeBracket = i;
      break;
    }
  }
  if (closeBracket === -1 || input[closeBracket + 1] !== "(") return null;

  const label = input.slice(start + 1, closeBracket);
  if (!label) return null;

  // Permite um nível de parênteses balanceados dentro da URL (ex.: artigos da Wikipédia).
  let depth = 1;
  let closeParen = -1;
  for (let i = closeBracket + 2; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\n" || /\s/.test(ch)) return null;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen === -1) return null;

  const href = input.slice(closeBracket + 2, closeParen);
  if (!isSafeHttpsUrl(href)) return null;

  return { text: label, href, nextIndex: closeParen + 1 };
}

function hasUnclosedSingleMarker(slice: string, markerChar: string): boolean {
  let open = false;
  let i = 0;
  while (i < slice.length) {
    if (slice[i] === "`") {
      let ticks = 0;
      while (i + ticks < slice.length && slice[i + ticks] === "`") ticks++;
      const close = findInlineCodeClose(slice, i + ticks, ticks);
      i = close === -1 ? i + ticks : close + ticks;
      continue;
    }
    if (slice[i] === markerChar) {
      let run = 0;
      while (i + run < slice.length && slice[i + run] === markerChar) run++;
      if (run === 1) {
        const prev = i > 0 ? slice[i - 1] : "";
        const next = i + 1 < slice.length ? slice[i + 1] : "";
        if (!open) {
          const canOpen =
            next !== "" &&
            !/\s/.test(next) &&
            (markerChar !== "_" || !isWordChar(prev));
          if (canOpen) open = true;
        } else {
          const canClose =
            prev !== "" &&
            !/\s/.test(prev) &&
            (markerChar !== "_" || !isWordChar(next));
          if (canClose) open = false;
        }
      }
      i += run;
      continue;
    }
    i++;
  }
  return open;
}

function findClosingDelimiter(
  input: string,
  from: number,
  markerChar: string,
  length: 1 | 2 | 3,
): number {
  let i = from;
  while (i < input.length) {
    if (input[i] === "\\" && i + 1 < input.length) {
      i += 2;
      continue;
    }
    if (input[i] === "`") {
      let ticks = 0;
      while (i + ticks < input.length && input[i + ticks] === "`") ticks++;
      const close = findInlineCodeClose(input, i + ticks, ticks);
      i = close === -1 ? i + ticks : close + ticks;
      continue;
    }
    if (input[i] === markerChar) {
      let run = 0;
      while (i + run < input.length && input[i + run] === markerChar) run++;

      // Ao procurar `*` simples, pula `**` interno para permitir `*a **b** c*`.
      if (length === 1 && run === 2) {
        i += 2;
        continue;
      }

      if (run >= length) {
        let closeAt = i;
        if (length === 1 && run === 3) {
          closeAt = i + 2;
        } else if (
          length === 2 &&
          run === 3 &&
          hasUnclosedSingleMarker(input.slice(from, i), markerChar)
        ) {
          closeAt = i + 1;
        }

        const prev = closeAt > 0 ? input[closeAt - 1] : "";
        const after =
          closeAt + length < input.length ? input[closeAt + length] : "";
        const validBoundary =
          prev !== "" &&
          !/\s/.test(prev) &&
          (markerChar !== "_" || !isWordChar(after));

        if (validBoundary && closeAt > from) {
          return closeAt;
        }
      }

      i += run;
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Converte um trecho de texto em nós inline de Markdown (negrito, itálico,
 * código inline, links https e quebras de linha). Marcadores de citação como
 * `[F1]` e palavras com snake_case permanecem como texto literal.
 */
export function parseInlines(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let textBuf = "";

  const flushText = () => {
    if (textBuf) {
      const last = nodes[nodes.length - 1];
      if (last && last.type === "text") {
        last.text += textBuf;
      } else {
        nodes.push({ type: "text", text: textBuf });
      }
      textBuf = "";
    }
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === "\n") {
      flushText();
      nodes.push({ type: "break" });
      i++;
      continue;
    }

    if (ch === "\\" && i + 1 < input.length && ESCAPABLE_RE.test(input[i + 1])) {
      textBuf += input[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      let tickCount = 0;
      while (i + tickCount < input.length && input[i + tickCount] === "`") {
        tickCount++;
      }
      const closeIdx = findInlineCodeClose(input, i + tickCount, tickCount);
      if (closeIdx !== -1 && closeIdx > i + tickCount) {
        flushText();
        const code = input.slice(i + tickCount, closeIdx).replace(/\n/g, " ");
        nodes.push({ type: "code", text: code });
        i = closeIdx + tickCount;
        continue;
      }
      textBuf += input.slice(i, i + tickCount);
      i += tickCount;
      continue;
    }

    if (ch === "[") {
      const link = tryParseLink(input, i);
      if (link) {
        flushText();
        nodes.push({ type: "link", text: link.text, href: link.href });
        i = link.nextIndex;
        continue;
      }
      textBuf += ch;
      i++;
      continue;
    }

    if (ch === "*" || ch === "_") {
      let run = 0;
      while (i + run < input.length && input[i + run] === ch && run < 3) {
        run++;
      }
      const prev = i > 0 ? input[i - 1] : "";
      const next = i + run < input.length ? input[i + run] : "";

      // Nunca abre `_` no meio de palavras (ex.: `fan_out`, `layered_fan_in`).
      const canOpen =
        next !== "" &&
        !/\s/.test(next) &&
        (ch !== "_" || !isWordChar(prev));

      if (canOpen) {
        const len = run as 1 | 2 | 3;
        const closeIdx = findClosingDelimiter(input, i + len, ch, len);
        if (closeIdx !== -1) {
          flushText();
          const inner = input.slice(i + len, closeIdx);
          if (len === 3) {
            nodes.push({
              type: "strong",
              children: [{ type: "emphasis", children: parseInlines(inner) }],
            });
          } else if (len === 2) {
            nodes.push({ type: "strong", children: parseInlines(inner) });
          } else {
            nodes.push({ type: "emphasis", children: parseInlines(inner) });
          }
          i = closeIdx + len;
          continue;
        }
      }

      textBuf += input.slice(i, i + run);
      i += run;
      continue;
    }

    textBuf += ch;
    i++;
  }

  flushText();
  return nodes;
}

function parseList(
  lines: string[],
  startIndex: number,
  allowNested: boolean,
): { block: ListBlock; nextIndex: number } {
  const first = matchListItem(lines[startIndex])!;
  const baseIndent = first.indent;
  const ordered = first.ordered;
  const rawItems: { text: string; sublist?: ListBlock }[] = [];

  let i = startIndex;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) break;

    const matched = matchListItem(line);
    if (matched) {
      if (matched.indent > baseIndent) {
        if (allowNested && rawItems.length > 0) {
          const nested = parseList(lines, i, false);
          rawItems[rawItems.length - 1].sublist = nested.block;
          i = nested.nextIndex;
          continue;
        }
        // Limite de 1 nível de aninhamento: itens mais recuados ficam no nível atual.
        if (!allowNested && matched.ordered === ordered) {
          rawItems.push({ text: matched.text.replace(/ +$/, "") });
          i++;
          continue;
        }
        break;
      }

      if (matched.indent < baseIndent || matched.ordered !== ordered) {
        break;
      }

      rawItems.push({ text: matched.text.replace(/ +$/, "") });
      i++;
      continue;
    }

    // Continuação indentada de item sem marcador (e sem iniciar outro bloco).
    if (
      rawItems.length > 0 &&
      !rawItems[rawItems.length - 1].sublist &&
      /^[ \t]+\S/.test(line) &&
      !isBlockStart(line)
    ) {
      rawItems[rawItems.length - 1].text += "\n" + line.trim();
      i++;
      continue;
    }

    break;
  }

  return {
    block: {
      type: "list",
      ordered,
      items: rawItems.map((item) => ({
        children: parseInlines(item.text),
        ...(item.sublist ? { sublist: item.sublist } : {}),
      })),
    },
    nextIndex: i,
  };
}

function parseLines(lines: string[]): BlockNode[] {
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const cleanText = heading[2].replace(/\s+#+\s*$/, "").trim();
      blocks.push({ type: "heading", level, children: parseInlines(cleanText) });
      i++;
      continue;
    }

    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const qm = BLOCKQUOTE_RE.exec(lines[i]);
        if (!qm) break;
        quoteLines.push(qm[1]);
        i++;
      }
      blocks.push({ type: "blockquote", blocks: parseLines(quoteLines) });
      continue;
    }

    if (matchListItem(line)) {
      const { block, nextIndex } = parseList(lines, i, true);
      blocks.push(block);
      i = nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && !isBlank(lines[i]) && !isBlockStart(lines[i])) {
      paragraphLines.push(lines[i].replace(/ +$/, ""));
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        children: parseInlines(paragraphLines.join("\n")),
      });
    }
  }

  return blocks;
}

/**
 * Converte um texto em Markdown gerado por IA em uma árvore de blocos e nós inline
 * sem usar HTML bruto, pronta para renderização segura em React ou testes unitários.
 */
export function parseMarkdown(source: string): BlockNode[] {
  if (!source) return [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  return parseLines(lines);
}
