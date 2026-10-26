import matter from "gray-matter";

export function lerMarkdownSeguro(raw: string) {
  const texto = raw.replace(/^\uFEFF/, "");
  const abertura = /^---[\t ]*(?:ya?ml[\t ]*)?\r?\n/.exec(texto);
  if (!abertura) throw new Error("Frontmatter deve usar somente YAML seguro.");
  const restante = texto.slice(abertura[0].length);
  const fechamento = /^---[\t ]*\r?$/m.exec(restante);
  if (!fechamento) throw new Error("Frontmatter YAML sem delimitador de fechamento.");
  const header = restante.slice(0, fechamento.index);
  // A abertura é reconstruída: nenhum seletor de engine da entrada chega ao gray-matter.
  // O engine YAML padrão do gray-matter usa js-yaml.safeLoad (sem tags executáveis).
  const { data, content } = matter(
    `---\n${header}---\n${restante.slice(fechamento.index + fechamento[0].length).replace(/^\r?\n/, "")}`,
    { language: "yaml" },
  );
  return { data, content, header };
}
