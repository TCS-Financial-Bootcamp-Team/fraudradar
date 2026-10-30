import matter from "gray-matter";

export function parseSafeMarkdown(raw: string) {
  const text = raw.replace(/^\uFEFF/, "");
  const opening = /^---[\t ]*(?:ya?ml[\t ]*)?\r?\n/.exec(text);
  if (!opening) throw new Error("Frontmatter deve usar somente YAML seguro.");
  const rest = text.slice(opening[0].length);
  const closing = /^---[\t ]*\r?$/m.exec(rest);
  if (!closing) throw new Error("Frontmatter YAML sem delimitador de fechamento.");
  const header = rest.slice(0, closing.index);
  // A abertura é reconstruída: nenhum seletor de engine da entrada chega ao gray-matter.
  // O engine YAML padrão do gray-matter usa js-yaml.safeLoad (sem tags executáveis).
  const { data, content } = matter(
    `---\n${header}---\n${rest.slice(closing.index + closing[0].length).replace(/^\r?\n/, "")}`,
    { language: "yaml" },
  );
  return { data, content, header };
}
